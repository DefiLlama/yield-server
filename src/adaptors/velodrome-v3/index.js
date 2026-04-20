const sdk = require('@defillama/sdk');
const axios = require('axios');

const utils = require('../utils');

const abiSugar = require('./abiSugar.json');
const abiSugarHelper = require('./abiSugarHelper.json');

const nullAddress = '0x0000000000000000000000000000000000000000';
const tickWidthMappings = { 1: 5, 50: 5, 100: 15, 200: 10, 2000: 2 };
const CHUNK_SIZE = 400;

// Superchain LP Sugar: 3-param `all(limit, offset, filter)` + extra struct fields.
const abiAllV3 = {
  inputs: [
    { name: '_limit', type: 'uint256' },
    { name: '_offset', type: 'uint256' },
    { name: '_filter', type: 'uint256' },
  ],
  name: 'all',
  outputs: [
    {
      type: 'tuple[]',
      components: [
        { name: 'lp', type: 'address' },
        { name: 'symbol', type: 'string' },
        { name: 'decimals', type: 'uint8' },
        { name: 'liquidity', type: 'uint256' },
        { name: 'type', type: 'int24' },
        { name: 'tick', type: 'int24' },
        { name: 'sqrt_ratio', type: 'uint160' },
        { name: 'token0', type: 'address' },
        { name: 'reserve0', type: 'uint256' },
        { name: 'staked0', type: 'uint256' },
        { name: 'token1', type: 'address' },
        { name: 'reserve1', type: 'uint256' },
        { name: 'staked1', type: 'uint256' },
        { name: 'gauge', type: 'address' },
        { name: 'gauge_liquidity', type: 'uint256' },
        { name: 'gauge_alive', type: 'bool' },
        { name: 'fee', type: 'address' },
        { name: 'bribe', type: 'address' },
        { name: 'factory', type: 'address' },
        { name: 'emissions', type: 'uint256' },
        { name: 'emissions_token', type: 'address' },
        { name: 'emissions_cap', type: 'uint256' },
        { name: 'pool_fee', type: 'uint256' },
        { name: 'unstaked_fee', type: 'uint256' },
        { name: 'token0_fees', type: 'uint256' },
        { name: 'token1_fees', type: 'uint256' },
        { name: 'locked', type: 'uint256' },
        { name: 'emerging', type: 'uint256' },
        { name: 'created_at', type: 'uint32' },
        { name: 'nfpm', type: 'address' },
        { name: 'alm', type: 'address' },
        { name: 'root', type: 'address' },
      ],
    },
  ],
  stateMutability: 'view',
  type: 'function',
};

const CHAINS = [
  {
    chain: 'optimism',
    sugar: '0x766133beae539ed33a7e27dfa3a840deaad88947',
    tokenSugar: '0x766133beae539ed33a7e27dfa3a840deaad88947',
    sugarHelper: '0x5Bd7E2221C2d59c99e6A9Cd18D80A5F4257D0f32',
    velo: '0x9560e827aF36c94D2Ac33a39bCE1Fe78631088Db',
    startOffset: 630, // skip pre-Slipstream pools
    abiAll: abiSugar.find((m) => m.name === 'all'),
    allParams: (limit, offset) => [limit, offset],
    poolSuffix: '', // preserve historical bare-address pool IDs
  },
  {
    chain: 'ink',
    sugar: '0xDd1399Df41d012F58cf2035A79839892BC0A2A25',
    tokenSugar: '0xB43cc32507238E6Ad44a363D544E47de4926D9df',
    sugarHelper: '0x222ed297aF0560030136AE652d39fa40E1B72818',
    velo: '0x7f9AdFbd38b669F03d1d11000Bc76b9AaEA28A81', // xVELO
    // xVELO is bridged 1:1 from OP VELO; coins.llama.fi prices VELO, not xVELO.
    veloPriceKey: 'optimism:0x9560e827aF36c94D2Ac33a39bCE1Fe78631088Db',
    startOffset: 0,
    abiAll: abiAllV3,
    allParams: (limit, offset) => [limit, offset, 0],
    poolSuffix: '-ink',
  },
];

async function getApyForChain(cfg) {
  const { chain, sugar, tokenSugar, sugarHelper, velo, veloPriceKey, startOffset, abiAll, allParams, poolSuffix } = cfg;

  const allPoolsData = [];
  let offset = startOffset;
  while (true) {
    const chunk = (
      await sdk.api.abi.call({
        target: sugar,
        params: allParams(CHUNK_SIZE, offset),
        abi: abiAll,
        chain,
      })
    ).output;
    const filtered = chunk.filter(
      (t) => Number(t.type) > 0 && t.gauge !== nullAddress
    );
    allPoolsData.push(...filtered);
    if (chunk.length === 0) break;
    offset += CHUNK_SIZE;
  }

  const allTokenData = [];
  offset = 0;
  while (true) {
    const chunk = (
      await sdk.api.abi.call({
        target: tokenSugar,
        params: [CHUNK_SIZE, offset, tokenSugar, []],
        abi: abiSugar.find((m) => m.name === 'tokens'),
        chain,
      })
    ).output;
    if (chunk.length === 0) break;
    allTokenData.push(...chunk);
    offset += CHUNK_SIZE;
  }

  const tokens = [
    ...new Set(
      allPoolsData
        .map((m) => [m.token0, m.token1])
        .flat()
        .concat(velo)
    ),
  ];

  const maxSize = 50;
  const pages = Math.ceil(tokens.length / maxSize);
  const pricesA = [];
  for (const p of [...Array(pages).keys()]) {
    const x = tokens
      .slice(p * maxSize, maxSize * (p + 1))
      .map((i) => `${chain}:${i}`)
      .join(',')
      .replaceAll('/', '');
    pricesA.push(
      (await axios.get(`https://coins.llama.fi/prices/current/${x}`)).data.coins
    );
  }
  if (veloPriceKey) {
    pricesA.push(
      (
        await axios.get(
          `https://coins.llama.fi/prices/current/${veloPriceKey}`
        )
      ).data.coins
    );
  }
  const prices = Object.assign({}, ...pricesA);

  const allStakedData = [];
  for (const pool of allPoolsData) {
    // don't waste RPC calls if gauge has no staked liquidity
    if (Number(pool.gauge_liquidity) === 0) {
      allStakedData.push({ amount0: 0, amount1: 0 });
      continue;
    }

    const wideTickAmount =
      tickWidthMappings[Number(pool.type)] !== undefined
        ? tickWidthMappings[Number(pool.type)]
        : 5;
    const lowTick = Number(pool.tick) - wideTickAmount * Number(pool.type);
    const highTick =
      Number(pool.tick) + (wideTickAmount - 1) * Number(pool.type);

    try {
      const ratioA = (
        await sdk.api.abi.call({
          target: sugarHelper,
          params: [lowTick],
          abi: abiSugarHelper.find((m) => m.name === 'getSqrtRatioAtTick'),
          chain,
        })
      ).output;

      const ratioB = (
        await sdk.api.abi.call({
          target: sugarHelper,
          params: [highTick],
          abi: abiSugarHelper.find((m) => m.name === 'getSqrtRatioAtTick'),
          chain,
        })
      ).output;

      const stakedAmounts = (
        await sdk.api.abi.call({
          target: sugarHelper,
          params: [pool.sqrt_ratio, ratioA, ratioB, pool.gauge_liquidity],
          abi: abiSugarHelper.find((m) => m.name === 'getAmountsForLiquidity'),
          chain,
        })
      ).output;

      allStakedData.push(stakedAmounts);
    } catch (e) {
      allStakedData.push({ amount0: 0, amount1: 0 });
    }
  }

  return allPoolsData.map((p, i) => {
    const token0Data = allTokenData.find(
      ({ token_address }) => token_address === p.token0
    );
    const token1Data = allTokenData.find(
      ({ token_address }) => token_address === p.token1
    );
    if (!token0Data || !token1Data) return null;

    const p0 = prices[`${chain}:${p.token0}`]?.price;
    const p1 = prices[`${chain}:${p.token1}`]?.price;

    const tvlUsd = ((p.reserve0 / (10 ** Number(token0Data.decimals))) * p0) + ((p.reserve1 / (10 ** Number(token1Data.decimals))) * p1);

    const stakedTvlUsd = ((allStakedData[i].amount0 / (10 ** token0Data.decimals)) * p0) + ((allStakedData[i].amount1 / (10 ** token1Data.decimals)) * p1);

    const s = token0Data.symbol + '-' + token1Data.symbol;

    const veloPrice =
      prices[`${chain}:${velo}`]?.price ||
      (veloPriceKey && prices[veloPriceKey]?.price);
    let apyReward = (((p.emissions / 1e18) * 86400 * 365 * veloPrice) / stakedTvlUsd) * 100;
    if (!Number.isFinite(apyReward)) apyReward = 0;

    const url = `https://velodrome.finance/deposit?token0=${p.token0}&token1=${p.token1}&type=${p.type.toString()}&factory=${p.factory}`;
    const poolMeta = `CL${p.type.toString()} - ${(p.pool_fee / 10000).toString()}%`;

    return {
      pool: `${p.lp}${poolSuffix || ''}`,
      chain: utils.formatChain(chain),
      project: 'velodrome-v3',
      symbol: s,
      tvlUsd,
      apyReward,
      rewardTokens: apyReward ? [velo] : [],
      underlyingTokens: [p.token0, p.token1],
      poolMeta,
      url,
    };
  }).filter(Boolean);
}

const getApy = async () => {
  const results = await Promise.all(CHAINS.map(getApyForChain));
  return results.flat().filter((p) => utils.keepFinite(p));
};

module.exports = {
  timetravel: false,
  apy: getApy,
};
