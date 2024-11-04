const sdk = require('@defillama/sdk');
const { request, gql } = require('graphql-request');
const superagent = require('superagent');

const utils = require('../utils');
const { checkStablecoin } = require('../../handlers/triggerEnrichment');
const { boundaries } = require('../../utils/exclude');
const masterchefAbi = require('./masterchef');
const deshareAbi = require('./deshare');
const axios = require('axios');
const pools = require('../concentrator/pools');

const masterchef = '0xd2bcFd6b84E778D2DE5Bb6A167EcBBef5D053A06';
const ARX = '0xD5954c3084a1cCd70B4dA011E67760B8e78aeE84';
const WETH = '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2';

const url = sdk.graph.modifyEndpoint('AQPMJVpukYUo96WvuKqn7aPZn3m8BHckYs82ZLSMKyeu');
const chain = 'arbitrum';

const query = gql`
  {
    pools(first: 1000, orderBy: totalValueLockedUSD, orderDirection: desc block: {number: <PLACEHOLDER>}) {
      id
      totalValueLockedToken0
      totalValueLockedToken1
      volumeUSD
      feeTier
      token0 {
        symbol
        id
        decimals
      }
      token1 {
        symbol
        id
        decimals
      }
    }
  }
`;

const queryPrior = gql`
  {
    pools( first: 1000 orderBy: totalValueLockedUSD orderDirection:desc block: {number: <PLACEHOLDER>}) {
      id
      volumeUSD
    }
  }
`;

const topLvl = async (
  chainString,
  url,
  query,
  queryPrior,
  version,
  timestamp,
  stablecoins
) => {
  try {
    const poolLength = (
      await sdk.api.abi.call({
        target: masterchef,
        abi: masterchefAbi.find((m) => m.name === 'poolLength'),
        chain: chainString,
      })
    ).output;

    const poolInfo = (
      await sdk.api.abi.multiCall({
        calls: [...Array(Number(poolLength)).keys()].map((i) => ({
          target: masterchef,
          params: [i],
        })),
        abi: masterchefAbi.find((m) => m.name === 'poolInfo'),
        chain: chainString,
      })
    ).output.map((o) => o.output);

    // find only v3 pools
    const pools = [];
    for (const pool of poolInfo) {
      try {
        const lpId = (
          await sdk.api.abi.call({
            target: pool.lpToken,
            abi: deshareAbi.find((m) => m.name === 'pool'),
            chain: chainString,
          })
        ).output;
        pool.lpId = lpId;
        pools.push(pool);
      } catch (error) {}
    }

    const arxTotalAllocPoint = (
      await sdk.api.abi.call({
        target: masterchef,
        abi: masterchefAbi.find((m) => m.name === 'arxTotalAllocPoint'),
        chain: chainString,
      })
    ).output;

    const wethTotalAllocPoint = (
      await sdk.api.abi.call({
        target: masterchef,
        abi: masterchefAbi.find((m) => m.name === 'WETHTotalAllocPoint'),
        chain: chainString,
      })
    ).output;

    const arxPerSec =
      (
        await sdk.api.abi.call({
          target: masterchef,
          abi: masterchefAbi.find((m) => m.name === 'arxPerSec'),
          chain: chainString,
        })
      ).output / 1e18;

    const wethPerSec =
      (
        await sdk.api.abi.call({
          target: masterchef,
          abi: masterchefAbi.find((m) => m.name === 'WETHPerSec'),
          chain: chainString,
        })
      ).output / 1e18;

    const arxPriceKey = `arbitrum:${ARX}`;
    const arxPrice = (
      await axios.get(`https://coins.llama.fi/prices/current/${arxPriceKey}`)
    ).data.coins[arxPriceKey]?.price;

    const wethPriceKey = `ethereum:${WETH}`;
    const wethPrice = (
      await axios.get(`https://coins.llama.fi/prices/current/${wethPriceKey}`)
    ).data.coins[wethPriceKey]?.price;

    const arxPerYearUsd = arxPerSec * 86400 * 365 * arxPrice;
    const wethPerYearUsd = wethPerSec * 86400 * 365 * wethPrice;

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
    let queryC = query;
    let dataNow = await request(url, queryC.replace('<PLACEHOLDER>', block));
    dataNow = dataNow.pools;

    // uni v3 subgraph reserves values are wrong!
    // instead of relying on subgraph values, gonna pull reserve data from contracts
    // new tvl calc
    const balanceCalls = [];
    for (const pool of dataNow) {
      balanceCalls.push({
        target: pool.token0.id,
        params: pool.id,
      });
      balanceCalls.push({
        target: pool.token1.id,
        params: pool.id,
      });
    }

    const tokenBalances = await sdk.api.abi.multiCall({
      abi: 'erc20:balanceOf',
      calls: balanceCalls,
      chain: chainString,
    });

    dataNow = dataNow.map((p) => {
      const x = tokenBalances.output.filter((i) => i.input.params[0] === p.id);
      return {
        ...p,
        reserve0:
          x.find((i) => i.input.target === p.token0.id).output /
          `1e${p.token0.decimals}`,
        reserve1:
          x.find((i) => i.input.target === p.token1.id).output /
          `1e${p.token1.decimals}`,
      };
    });

    // pull 24h offset data to calculate fees from swap volume
    let queryPriorC = queryPrior;
    let dataPrior = await request(
      url,
      queryPriorC.replace('<PLACEHOLDER>', blockPrior)
    );
    dataPrior = dataPrior.pools;

    // calculate tvl
    dataNow = await utils.tvl(dataNow, chainString);

    // to reduce the nb of subgraph calls for tick range, we apply the lb db filter in here
    dataNow = dataNow.filter(
      (p) => p.totalValueLockedUSD >= boundaries.tvlUsdDB.lb
    );
    // add the symbol for the stablecoin (we need to distinguish btw stable and non stable pools
    // so we apply the correct tick range)
    dataNow = dataNow.map((p) => {
      const symbol = utils.formatSymbol(
        `${p.token0.symbol}-${p.token1.symbol}`
      );
      const stablecoin = checkStablecoin({ ...p, symbol }, stablecoins);
      return {
        ...p,
        symbol,
        stablecoin,
      };
    });

    // for new v3 apy calc
    const dataPrior7d = (
      await request(url, queryPriorC.replace('<PLACEHOLDER>', blockPrior7d))
    ).pools;

    // calc apy (note: old way of using 24h fees * 365 / tvl. keeping this for now) and will store the
    // new apy calc as a separate field
    dataNow = dataNow.map((el) =>
      utils.apy(el, dataPrior, dataPrior7d, version)
    );

    return dataNow.map((p) => {
      const poolMeta = `${p.feeTier / 1e4}%`;
      const underlyingTokens = [p.token0.id, p.token1.id];
      const token0 = underlyingTokens === undefined ? '' : underlyingTokens[0];
      const token1 = underlyingTokens === undefined ? '' : underlyingTokens[1];
      const chain = chainString;

      const feeTier = Number(poolMeta.replace('%', '')) * 10000;
      const url = `https://arbidex.fi/quantumliquidity/`;

      const arxAllocPoint = pools.find(
        (pid) => pid.lpId.toLowerCase() === p.id?.toLowerCase()
      )?.arxAllocPoint;

      const wethAllocPoint = pools.find(
        (pid) => pid.lpId.toLowerCase() === p.id?.toLowerCase()
      )?.WETHAllocPoint;

      const arxApyReward =
        (((arxAllocPoint / arxTotalAllocPoint) * arxPerYearUsd) /
          p.totalValueLockedUSD) *
        100;

      const wethApyReward =
        (((wethAllocPoint / wethTotalAllocPoint) * wethPerYearUsd) /
          p.totalValueLockedUSD) *
        100;

      const apyReward = arxApyReward + wethApyReward;

      return {
        pool: p.id,
        chain: utils.formatChain(chainString),
        project: 'arbitrum-exchange-v3',
        poolMeta: `${poolMeta}, stablePool=${p.stablecoin}`,
        symbol: p.symbol,
        tvlUsd: p.totalValueLockedUSD,
        apyReward,
        rewardTokens: apyReward > 0 ? [WETH, ARX] : [],
        underlyingTokens,
        url,
        volumeUsd1d: p.volumeUSD1d,
        volumeUsd7d: p.volumeUSD7d,
      };
    });
  } catch (e) {
    if (e.message.includes('Stale subgraph')) return [];
    else throw e;
  }
};

const main = async (timestamp = null) => {
  const stablecoins = (
    await superagent.get(
      'https://stablecoins.llama.fi/stablecoins?includePrices=true'
    )
  ).body.peggedAssets.map((s) => s.symbol.toLowerCase());
  if (!stablecoins.includes('eur')) stablecoins.push('eur');
  if (!stablecoins.includes('3crv')) stablecoins.push('3crv');

  const data = await topLvl(
    chain,
    url,
    query,
    queryPrior,
    'v3',
    timestamp,
    stablecoins
  );
  return data.filter((p) => utils.keepFinite(p));
};

module.exports = {
  timetravel: false,
  apy: main,
};
