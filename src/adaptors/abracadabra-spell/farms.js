const sdk = require('@defillama/sdk');
const superagent = require('superagent');
const utils = require('../utils');
const SORBETTIERE_ABI = require('./abis/Sorbettiere.json');
const UNISWAP_V2_PAIR_ABI = require('./abis/UniswapV2Pair.json');

const makeCall = async (targets, abi) => {
  return (
    await sdk.api.abi.multiCall({
      abi,
      calls: targets.map((target) => ({ target })),
      chain: 'aurora',
      permitFailure: true,
    })
  ).output.map(({ output }) => output);
};

const SPELL_ADDRESS = '0x090185f2135308bad17527004364ebcc2d37e5f6';

const getPrices = async (addresses) => {
  const prices = (
    await superagent.get(
      `https://coins.llama.fi/prices/current/${addresses
        .join(',')
        .toLowerCase()}`
    )
  ).body.coins;

  const pricesObj = Object.entries(prices).reduce(
    (acc, [address, price]) => ({
      ...acc,
      [address.split(':')[1].toLowerCase()]: price.price,
    }),
    {}
  );

  return pricesObj;
};

const POOLS = {
  fantom: {
    pool: '0x37Cf490255082ee50845EA4Ff783Eb9b6D1622ce',
    name: 'MIM-fUSDT-USDC',
  },
  arbitrum: {
    pool: '0x839De324a1ab773F76a53900D70Ac1B913d2B387',
    name: 'MIM-3CRV',
  },
  ethereum: {
    pool: '0xF43480afE9863da4AcBD4419A47D9Cc7d25A647F',
    name: 'SPELL-ETH',
  },
};

const getApy = async () => {
  const spellPerSec = await Promise.all(
    Object.keys(POOLS).map(
      async (chain) =>
        (
          await sdk.api.abi.call({
            target: POOLS[chain].pool,
            abi: SORBETTIERE_ABI.find(({ name }) => name === 'icePerSecond'),
            chain,
            permitFailure: true,
          })
        ).output
    )
  );

  const poolsLength = await Promise.all(
    Object.keys(POOLS).map(
      async (chain) =>
        (
          await sdk.api.abi.call({
            target: POOLS[chain].pool,
            abi: SORBETTIERE_ABI.find(({ name }) => name === 'poolLength'),
            chain,
            permitFailure: true,
          })
        ).output
    )
  );

  const poolsInfo = await Promise.all(
    Object.keys(POOLS).map(async (chain, i) =>
      (
        await sdk.api.abi.multiCall({
          calls: [...Array(Number(poolsLength[i])).keys()].map((idx) => ({
            params: idx,
            target: POOLS[chain].pool,
          })),
          abi: SORBETTIERE_ABI.find(({ name }) => name === 'poolInfo'),
          chain,
          permitFailure: true,
        })
      ).output.map(({ output }) => output)
    )
  );

  const lpSupply = await Promise.all(
    Object.keys(POOLS).map(async (chain, i) =>
      (
        await sdk.api.abi.multiCall({
          calls: poolsInfo[i].map((pool) => ({
            target: pool.stakingToken,
          })),
          abi: 'erc20:totalSupply',
          chain,
          permitFailure: true,
        })
      ).output.map(({ output }) => output)
    )
  );

  const lpSymbol = await Promise.all(
    Object.keys(POOLS).map(async (chain, i) =>
      (
        await sdk.api.abi.multiCall({
          calls: poolsInfo[i].map((pool) => ({
            target: pool.stakingToken,
          })),
          abi: 'erc20:symbol',
          chain,
          permitFailure: true,
        })
      ).output.map(({ output }) => output)
    )
  );

  const underlying0 = await Promise.all(
    Object.keys(POOLS).map(async (chain, i) =>
      (
        await sdk.api.abi.multiCall({
          calls: poolsInfo[i].map((pool) => ({
            target: pool.stakingToken,
          })),
          abi: UNISWAP_V2_PAIR_ABI.find(({ name }) => name === 'token0'),
          chain,
          permitFailure: true,
        })
      ).output.map(({ output }) => output)
    )
  );
  const underlying1 = await Promise.all(
    Object.keys(POOLS).map(async (chain, i) =>
      (
        await sdk.api.abi.multiCall({
          calls: poolsInfo[i].map((pool) => ({
            target: pool.stakingToken,
          })),
          abi: UNISWAP_V2_PAIR_ABI.find(({ name }) => name === 'token1'),
          chain,
          permitFailure: true,
        })
      ).output.map(({ output }) => output)
    )
  );

  const underlying0Symbol = await Promise.all(
    Object.keys(POOLS).map(async (chain, i) =>
      (
        await sdk.api.abi.multiCall({
          calls: underlying0[i].map((pool) => ({
            target: pool,
          })),
          abi: 'erc20:symbol',
          chain,
          permitFailure: true,
        })
      ).output.map(({ output }) => output)
    )
  );
  const underlying1Symbol = await Promise.all(
    Object.keys(POOLS).map(async (chain, i) =>
      (
        await sdk.api.abi.multiCall({
          calls: underlying1[i].map((pool) => ({
            target: pool,
          })),
          abi: 'erc20:symbol',
          chain,
          permitFailure: true,
        })
      ).output.map(({ output }) => output)
    )
  );

  const lpReserves = await Promise.all(
    Object.keys(POOLS).map(async (chain, i) =>
      (
        await sdk.api.abi.multiCall({
          calls: poolsInfo[i].map((pool) => ({
            target: pool.stakingToken,
          })),
          abi: UNISWAP_V2_PAIR_ABI.find(({ name }) => name === 'getReserves'),
          chain,
          permitFailure: true,
        })
      ).output.map(({ output }) => output)
    )
  );

  const tokens0WithChain = Object.keys(POOLS).map((chain, i) =>
    underlying0[i].map((token) => `${chain}:${token}`)
  );
  const tokens1WithChain = Object.keys(POOLS).map((chain, i) =>
    underlying1[i].map((token) => `${chain}:${token}`)
  );

  const prices = await getPrices(
    tokens0WithChain.concat(tokens1WithChain).flat()
  );

  const spellPrice = prices[SPELL_ADDRESS];

  const pools = Object.keys(POOLS).map((chain, i) => {
    const totalAllocPoint = poolsInfo[i].reduce(
      (acc, val) => +val.allocPoint + acc,
      0
    );
    const rewardPerYear =
      ((spellPerSec[i] * 60 * 60 * 24 * 365) / 1e18) * spellPrice;

    return poolsInfo[i].map((pool, idx) => {
      const token0 = underlying0[i][idx];
      const token1 = underlying1[i][idx];

      let tvlUsd = 0;
      const isCryptoPool = token0 && token1;

      if (isCryptoPool) {
        const poolShare = pool.stakingTokenTotalAmount / lpSupply[i][idx];
        const token0Price = prices[token0.toLowerCase()];
        const token1Price = prices[token1.toLowerCase()];

        const lpTvl =
          (token0Price * Number(lpReserves[i][idx]._reserve0)) / 1e18 +
          (token1Price * Number(lpReserves[i][idx]._reserve1)) / 1e18;
        tvlUsd = lpTvl * poolShare;
      } else {
        tvlUsd = Number(pool.stakingTokenTotalAmount) / 1e18;
      }
      const apyReward =
        ((rewardPerYear * (pool.allocPoint / totalAllocPoint)) / tvlUsd) * 100;

      const symbol = isCryptoPool
        ? `${underlying0Symbol[i][idx]}-${underlying1Symbol[i][idx]}`
        : lpSymbol[i][idx];

      return {
        pool: `${pool.stakingToken}-abracadabra`,
        chain: utils.formatChain(chain),
        project: 'abracadabra-spell',
        tvlUsd,
        symbol,
        apyReward,
        rewardTokens: [SPELL_ADDRESS],
        underlyingTokens: [token0, token1].filter(Boolean),
      };
    });
  });

  return pools.flat();
};

module.exports = getApy;
