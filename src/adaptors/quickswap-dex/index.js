const { request, gql } = require('graphql-request');
const sdk = require('@defillama/sdk3');
const axios = require('axios');

const utils = require('../utils');
const farmAbi = require('./farmAbi');

const url = 'https://polygon.furadao.org/subgraphs/name/quickswap';
const urlFarming =
  'https://api.thegraph.com/subgraphs/name/sameepsi/quickswap-v3-farming';

const QUICK = '0xb5c064f955d8e7f38fe0460c556a72987494ee17';

const query = gql`
  {
    pairs(first: 1000, orderBy: trackedReserveETH, orderDirection: desc block: {number: <PLACEHOLDER>}) {
      id
      volumeUSD
      reserve0
      reserve1
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

const queryFarm = gql`
  query MyQuery {
    eternalFarmings(where: { isDetached: false }) {
      id
      rewardRate
      bonusRewardRate
      bonusRewardToken
      pool
      reward
      rewardToken
    }
  }
`;

const buildPool = (entry, chainString) => {
  const symbol = utils.formatSymbol(
    `${entry.token0.symbol}-${entry.token1.symbol}`
  );

  const newObj = {
    pool: entry.id,
    chain: utils.formatChain(chainString),
    project: 'quickswap-dex',
    symbol,
    tvlUsd: entry.totalValueLockedUSD,
    apyBase: entry.apy1d,
    apyBase7d: entry.apy7d,
    underlyingTokens: [entry.token0.id, entry.token1.id],
    volumeUsd1d: entry.volumeUSD1d,
    volumeUsd7d: entry.volumeUSD7d,
  };

  return newObj;
};

const topLvl = async (chainString, timestamp, url, version) => {
  const farm = (await request(urlFarming, queryFarm)).eternalFarmings;
  const farmingPools = farm.map((f) => f.pool);

  const [token0Res, token1Res] = await Promise.all(
    ['token0', 'token1'].map((method) => {
      return sdk.api.abi.multiCall({
        calls: farmingPools.map((p) => ({ target: p })),
        chain: 'polygon',
        abi: farmAbi.find((m) => m.name === method),
      });
    })
  );
  const token0 = token0Res.output.map((o) => o.output);
  const token1 = token1Res.output.map((o) => o.output);

  const balanceOfToken0 = (
    await sdk.api.abi.multiCall({
      calls: token0.map((t, i) => ({ target: t, params: farmingPools[i] })),
      chain: 'polygon',
      abi: 'erc20:balanceOf',
    })
  ).output.map((o) => o.output);

  const balanceOfToken1 = (
    await sdk.api.abi.multiCall({
      calls: token1.map((t, i) => ({ target: t, params: farmingPools[i] })),
      chain: 'polygon',
      abi: 'erc20:balanceOf',
    })
  ).output.map((o) => o.output);

  const decimalsToken0 = (
    await sdk.api.abi.multiCall({
      calls: token0.map((t, i) => ({ target: t })),
      chain: 'polygon',
      abi: 'erc20:decimals',
    })
  ).output.map((o) => o.output);

  const decimalsToken1 = (
    await sdk.api.abi.multiCall({
      calls: token1.map((t, i) => ({ target: t })),
      chain: 'polygon',
      abi: 'erc20:decimals',
    })
  ).output.map((o) => o.output);

  const symbolsToken0 = (
    await sdk.api.abi.multiCall({
      calls: token0.map((t, i) => ({ target: t })),
      chain: 'polygon',
      abi: 'erc20:symbol',
    })
  ).output.map((o) => o.output);

  const symbolsToken1 = (
    await sdk.api.abi.multiCall({
      calls: token1.map((t, i) => ({ target: t })),
      chain: 'polygon',
      abi: 'erc20:symbol',
    })
  ).output.map((o) => o.output);

  const liquidity = (
    await sdk.api.abi.multiCall({
      calls: farmingPools.map((p) => ({ target: p })),
      chain: 'polygon',
      abi: farmAbi.find((m) => m.name === 'liquidity'),
    })
  ).output.map((o) => o.output);

  const priceKeys = token0
    .concat(token1)
    .concat(QUICK)
    .map((t) => `polygon:${t}`)
    .join(',');

  const prices = (
    await axios.get(`https://coins.llama.fi/prices/current/${priceKeys}`)
  ).data.coins;

  const farmTvl = (
    await axios.get('https://apiv3.quickswap.exchange/api/TVL/eternalFarmings/')
  ).data;

  const farms = farm.map((f, i) => {
    // calc farm tvl
    // const tvlUsd =
    //   (balanceOfToken0[i] / 10 ** decimalsToken0[i]) *
    //     prices[`polygon:${token0[i]}`]?.price +
    //   (balanceOfToken1[i] / 10 ** decimalsToken1[i]) *
    //     prices[`polygon:${token1[i]}`]?.price;
    // const tvlUsd = liquidity[i] / 1e18;

    const tvlUsd = farmTvl[f.id];

    const apyReward =
      (((f.rewardRate / 1e18) *
        86400 *
        365 *
        prices[`polygon:${QUICK}`]?.price) /
        tvlUsd) *
      100;

    return {
      pool: f.pool,
      symbol: `${symbolsToken0[i]}-${symbolsToken1[i]}`,
      chain: 'polygon',
      tvlUsd,
      apyReward,
      rewardTokens: f.rewardToken,
      underlyingTokens: [token0[i], token1[i]],
    };
  });

  return farms;

  // const sushiPolygon =
  //   'https://api.thegraph.com/subgraphs/name/sushiswap/matic-exchange';
  // const [block, blockPrior] = await utils.getBlocks(
  //   chainString,
  //   timestamp,
  //   // this is a hack, cause the above url has the wrong prefix so we cannot use it
  //   // note(!) not sure if i should keep this, or just remove quickswap from timetravel
  //   [sushiPolygon]
  // );

  // const [_, blockPrior7d] = await utils.getBlocks(
  //   chainString,
  //   timestamp,
  //   [sushiPolygon],
  //   604800
  // );

  // // pull data
  // let data = (await request(url, query.replace('<PLACEHOLDER>', block))).pairs;

  // // pull 24h offset data to calculate fees from swap volume
  // const dataPrior = (
  //   await request(url, queryPrior.replace('<PLACEHOLDER>', blockPrior))
  // ).pairs;

  // // 7d offset
  // const dataPrior7d = (
  //   await request(url, queryPrior.replace('<PLACEHOLDER>', blockPrior7d))
  // ).pairs;

  // // calculate tvl
  // data = await utils.tvl(data, chainString);

  // // calculate apy
  // data = data.map((el) => utils.apy(el, dataPrior, dataPrior7d, version));

  // // build pool objects
  // data = data.map((el) => buildPool(el, chainString));

  // return data;
};

const main = async (timestamp = null) => {
  const data = await Promise.all([topLvl('polygon', timestamp, url, 'v2')]);
  return data.flat();
};

module.exports = {
  timetravel: true,
  apy: main,
  url: 'https://quickswap.exchange/#/pool',
};
