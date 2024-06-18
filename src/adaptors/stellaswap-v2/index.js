const sdk = require('@defillama/sdk');
const { request, gql } = require('graphql-request');
const axios = require('axios');

const utils = require('../utils');
const abiMasterchef = require('./abiMasterchef.js');
const abiLpToken = require('./abiLpToken.js');
const abiStableSwap = require('./abiStableSwap.js');
const pools = require('../concentrator/pools');

const project = 'stellaswap-v2';

const url = sdk.graph.modifyEndpoint('HgSAfZvHEDbAVuZciPUYEqFzhAUnjJWmyix5C1R2tmTp');
const urlStable = sdk.graph.modifyEndpoint('bqFx2yiB2VBH8LAJMGZ37Zj3NtBrY7gArFFciLaA3nE');
const masterchef = '0xF3a5454496E26ac57da879bf3285Fa85DEBF0388';
const STELLA = '0x0e358838ce72d5e61e0018a2ffac4bec5f4c88d2';
const STELLA_DEC = 18;

// most tokens aren't available on our price api
const rewardTokenMapping = {
  '0xAcc15dC74880C9944775448304B263D191c6077F': 'moonbeam',
  '0x511aB53F793683763E5a8829738301368a2411E3': 'moonwell-artemis',
  '0xCBABEe0658725b5B21e1512244734A5D5C6B51D6': 'athos-finance',
  '0x9Fda7cEeC4c18008096C2fE2B85F05dc300F94d0': 'lido-dao',
};

const query = gql`
  {
    pairs(first: 1000, orderBy: trackedReserveETH, orderDirection: desc block: {number: <PLACEHOLDER>}) {
      id
      reserve0
      reserve1
      volumeUSD
      token0 {
        symbol
        id
      }
      token1 {
        symbol
        id
      }
    }
  }
`;

const queryPrior = gql`
  {
    pairs (first: 1000 orderBy: trackedReserveETH orderDirection: desc block: {number: <PLACEHOLDER>}) { 
      id 
      volumeUSD 
    }
  }
`;

const queryStablePools = gql`
  query swapData($id: String!) {
    swap(id: $id) {
      id
      lpToken
      tokens {
        decimals
        symbol
        address
      }
      weeklyVolumes(first: 1) {
        volume
      }
      dailyVolumes(first: 1) {
        volume
      }
      swapFee
    }
  }
`;

const stablePools = [
  '0xb1bc9f56103175193519ae1540a0a4572b1566f6',
  '0xa1ffdc79f998e7fa91ba3a6f098b84c9275b0483',
  '0xf0a2ae65342f143fc09c83e5f19b706abb37414d',
];

const apyBase = async (
  chainString,
  url,
  query,
  queryPrior,
  version,
  timestamp
) => {
  const [block, blockPrior] = await utils.getBlocks(chainString, timestamp, [
    url,
  ]);

  const [_, blockPrior7d] = await utils.getBlocks(
    chainString,
    timestamp,
    [url],
    604800
  );

  // pull data
  let dataNow = (await request(url, query.replace('<PLACEHOLDER>', block)))
    .pairs;

  // pull 24h offset data to calculate fees from swap volume
  const dataPrior = (
    await request(url, queryPrior.replace('<PLACEHOLDER>', blockPrior))
  ).pairs;

  // 7d offset
  const dataPrior7d = (
    await request(url, queryPrior.replace('<PLACEHOLDER>', blockPrior7d))
  ).pairs;

  // calculate tvl
  dataNow = await utils.tvl(dataNow, chainString);
  // calculate apy
  dataNow = dataNow.map((p) => utils.apy(p, dataPrior, dataPrior7d, version));

  dataNow = dataNow.map((p) => {
    const symbol = utils.formatSymbol(`${p.token0.symbol}-${p.token1.symbol}`);
    const underlyingTokens = [p.token0.id, p.token1.id];
    const token0 = underlyingTokens === undefined ? '' : underlyingTokens[0];
    const token1 = underlyingTokens === undefined ? '' : underlyingTokens[1];
    const chain = 'moonbeam';

    return {
      pool: p.id.toLowerCase(),
      chain: utils.formatChain(chainString),
      project,
      symbol,
      tvlUsd: p.totalValueLockedUSD,
      apyBase: p.apy1d,
      apyBase7d: p.apy7d,
      underlyingTokens,
      volumeUsd1d: p.volumeUSD1d,
      volumeUsd7d: p.volumeUSD7d,
    };
  });

  // stable pools
  const stablePoolUnderlyingTokens = (
    await sdk.api.abi.multiCall({
      calls: stablePools.map((p) => ({ target: p })),
      chain: 'moonbeam',
      abi: abiStableSwap.find((m) => m.name === 'getTokens'),
    })
  ).output.map((o) => o.output);

  const stablePoolBalances = (
    await sdk.api.abi.multiCall({
      calls: stablePools.map((p) => ({ target: p })),
      chain: 'moonbeam',
      abi: abiStableSwap.find((m) => m.name === 'getTokenBalances'),
    })
  ).output.map((o) => o.output);

  let dataStables = await Promise.all(
    stablePools.map((p) => {
      return request(urlStable, queryStablePools, {
        id: p.toLowerCase(),
      });
    })
  );

  dataStables = dataStables.map((p, i) => {
    const pool = p.swap;
    if (pool === null) return null;

    const tvlUsd = stablePoolBalances[i]
      .map((balance, j) => {
        const decimal = pool.tokens.find(
          (x) =>
            x.address.toLowerCase() ===
            stablePoolUnderlyingTokens[i][j].toLowerCase()
        ).decimals;

        return balance / 10 ** decimal;
      })
      .reduce((a, b) => a + b);

    const apyBase =
      ((pool.dailyVolumes[0].volume * pool.swapFee) / 1e8 / tvlUsd) * 100;
    const apyBase7d =
      ((pool.weeklyVolumes[0].volume * pool.swapFee) / 1e8 / tvlUsd) * 100;
    const symbol = utils.formatSymbol(
      pool.tokens.map((t) => t.symbol).join('-')
    );
    const underlyingTokens = pool.tokens.map((t) => t.address);

    return {
      pool: pool.lpToken.toLowerCase(),
      chain: utils.formatChain(chainString),
      project,
      symbol,
      tvlUsd,
      apyBase,
      apyBase7d,
      underlyingTokens,
    };
  });

  return [...dataNow, ...dataStables].filter((p) => p !== null);
};

const getApy = async (timestamp = null) => {
  // ------------ fee apr for all pools
  const dataFee = (
    await apyBase('moonbeam', url, query, queryPrior, 'stellaswap', timestamp)
  ).filter((p) => utils.keepFinite(p));

  // ------------ add reward apr only for pools in farms
  const poolLength = (
    await sdk.api.abi.call({
      target: masterchef,
      abi: abiMasterchef.find((m) => m.name === 'poolLength'),
      chain: 'moonbeam',
    })
  ).output;

  const poolInfo = (
    await sdk.api.abi.multiCall({
      calls: [...Array(Number(poolLength)).keys()].map((i) => ({
        target: masterchef,
        params: [i],
      })),
      chain: 'moonbeam',
      abi: abiMasterchef.find((m) => m.name === 'poolInfo'),
    })
  ).output.map((o) => o.output);

  // contains all rewards (including stella though those seem off; going to use this only for
  // other rewards aka extraRewards
  const poolRewardsPerSec = (
    await sdk.api.abi.multiCall({
      calls: [...Array(Number(poolLength)).keys()].map((i) => ({
        target: masterchef,
        params: [i],
      })),
      chain: 'moonbeam',
      abi: abiMasterchef.find((m) => m.name === 'poolRewardsPerSec'),
    })
  ).output.map((o) => o.output);

  const stellaPerSec =
    (
      await sdk.api.abi.call({
        target: masterchef,
        abi: abiMasterchef.find((m) => m.name === 'stellaPerSec'),
        chain: 'moonbeam',
      })
    ).output /
    10 ** STELLA_DEC;

  const totalAllocPoint = (
    await sdk.api.abi.call({
      target: masterchef,
      abi: abiMasterchef.find((m) => m.name === 'totalAllocPoint'),
      chain: 'moonbeam',
    })
  ).output;

  const stellaPrice = (
    await axios.get(`https://coins.llama.fi/prices/current/moonbeam:${STELLA}`)
  ).data.coins[`moonbeam:${STELLA}`].price;

  const [supplyRes, masterChefBalancesRes] = await Promise.all(
    ['totalSupply', 'balanceOf'].map((method) =>
      sdk.api.abi.multiCall({
        abi: abiLpToken.filter(({ name }) => name === method)[0],
        calls: poolInfo.map((p) => ({
          target: p.lpToken,
          params: method === 'balanceOf' ? [masterchef] : null,
        })),
        chain: 'moonbeam',
      })
    )
  );
  const totalSupply = supplyRes.output.map((o) => o.output);
  const masterChefBalances = masterChefBalancesRes.output.map((o) => o.output);

  const tokenKeys = Object.values(rewardTokenMapping)
    .map((t) => `coingecko:${t}`)
    .join(',');
  const extrRewardTokenPrices = (
    await axios.get(`https://coins.llama.fi/prices/current/${tokenKeys}`)
  ).data.coins;

  const dataRewards = poolInfo.map((p, i) => {
    const pool = dataFee.find((d) => d.pool === p.lpToken.toLowerCase());
    if (pool === undefined) return { ...p };

    const poolShare = Number(p.allocPoint) / Number(totalAllocPoint);
    const stellaPerDay = stellaPerSec * poolShare * 86400;

    const reserveRatio = masterChefBalances[i] / totalSupply[i];
    const farmTvlUsd = reserveRatio * pool.tvlUsd;
    const stellaAPR = ((stellaPrice * stellaPerDay * 365) / farmTvlUsd) * 100;

    const extraRewardAddresses = poolRewardsPerSec[i].addresses;
    const extraRewardDecimals = poolRewardsPerSec[i].decimals;
    const rewardsPerSec = poolRewardsPerSec[i].rewardsPerSec;

    const rewardTokens = new Set();
    let extraAPR = 0;
    for (const [j, a] of extraRewardAddresses.entries()) {
      if (a === STELLA) continue;
      const rewardsPerDay =
        (rewardsPerSec[j] / 10 ** extraRewardDecimals[j]) * 86400;

      const price =
        extrRewardTokenPrices[`coingecko:${rewardTokenMapping[a]}`]?.price ?? 0;
      extraAPR += ((price * rewardsPerDay * 365) / farmTvlUsd) * 100;
      rewardTokens.add(a);
    }

    return {
      ...p,
      stellaAPR,
      extraAPR,
      rewardTokens:
        stellaAPR > 0 ? [STELLA, ...rewardTokens] : [...rewardTokens],
      farmTvlUsd,
    };
  });

  const dataRewardsObj = {};
  for (const p of dataRewards) {
    dataRewardsObj[p.lpToken.toLowerCase()] = p;
  }

  return dataFee.map((p) => {
    const pool = dataRewardsObj[p.pool.toLowerCase()];
    if (pool === undefined) return { ...p };

    return {
      ...p,
      apyReward: pool.stellaAPR + pool.extraAPR,
      rewardTokens: pool.rewardTokens,
      tvlUsd: pool.farmTvlUsd,
    };
  });
};

module.exports = {
  timetravel: false,
  apy: getApy,
  url: 'https://app.stellaswap.com/farm',
};
