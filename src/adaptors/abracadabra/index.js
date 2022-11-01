const sdk = require('@defillama/sdk');
const { default: BigNumber } = require('bignumber.js');
const superagent = require('superagent');
const utils = require('../utils');
const { poolAbi, lpAbi, curveLpAbi } = require('./abi');

const makeCall = async (targets, abi) => {
  return (
    await sdk.api.abi.multiCall({
      abi,
      calls: targets.map((target) => ({ target })),
      chain: 'aurora',
    })
  ).output.map(({ output }) => output);
};

const SPELL_ADDRESS = '0x090185f2135308bad17527004364ebcc2d37e5f6';

const getPrices = async (addresses) => {
  const prices = (
    await superagent.post('https://coins.llama.fi/prices').send({
      coins: addresses,
    })
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
            abi: poolAbi.find(({ name }) => name === 'icePerSecond'),
            chain,
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
            abi: poolAbi.find(({ name }) => name === 'poolLength'),
            chain,
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

          abi: poolAbi.find(({ name }) => name === 'poolInfo'),
          chain,
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
          abi: lpAbi.find(({ name }) => name === 'token0'),
          chain,
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
          abi: lpAbi.find(({ name }) => name === 'token1'),
          chain,
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
          abi: lpAbi.find(({ name }) => name === 'getReserves'),
          chain,
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
        project: 'abracadabra',
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
const ABICDP = {
  collateral: {
    inputs: [],
    name: 'collateral',
    outputs: [
      {
        internalType: 'contract IERC20',
        name: '',
        type: 'address',
      },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  COLLATERIZATION_RATE: {
    inputs: [],
    name: 'COLLATERIZATION_RATE',
    outputs: [
      {
        internalType: 'uint256',
        name: '',
        type: 'uint256',
      },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  totalBorrow: {
    inputs: [],
    name: 'totalBorrow',
    outputs: [
      {
        internalType: 'uint128',
        name: 'elastic',
        type: 'uint128',
      },
      {
        internalType: 'uint128',
        name: 'base',
        type: 'uint128',
      },
    ],
    stateMutability: 'view',
    type: 'function',
  },
};

const cdpChainMap = {
  1: 'ethereum',
  43114: 'avalanche',
  250: 'fantom',
  42161: 'arbitrum',
  56: 'binance',
};

const chainMap = {
  1: 'ethereum',
  43114: 'avax',
  250: 'fantom',
  42161: 'arbitrum',
  56: 'bsc',
};
const MIM_ID = 'magic-internet-money';
const getCdp = async () => {
  const URL = 'https://analytics.abracadabra.money/api/pools';
  const data = (await utils.getData(URL)).pools;
  const mimPrice = (await utils.getPrices([`coingecko:${MIM_ID}`]))
    .pricesByAddress[MIM_ID.toLowerCase()];
  const result = [];
  for (const chainId of Object.keys(cdpChainMap)) {
    const dataByChain = data.filter((e) => e.network == chainId);
    const chain = cdpChainMap[chainId];
    console.log(chain);
    const collateralAddress = (
      await sdk.api.abi.multiCall({
        abi: ABICDP.collateral,
        calls: dataByChain.map((p) => {
          return { target: p.address };
        }),
        chain: chainMap[chainId],
      })
    ).output.map((e) => e.output);

    const collateralRate = (
      await sdk.api.abi.multiCall({
        abi: ABICDP.COLLATERIZATION_RATE,
        calls: dataByChain.map((p) => {
          return { target: p.address };
        }),
        chain: chainMap[chainId],
      })
    ).output.map((e) => e.output);

    const underlyings = (
      await sdk.api.abi.multiCall({
        abi: 'erc20:symbol',
        calls: collateralAddress.map((target) => {
          return { target };
        }),
        chain: chainMap[chainId],
        requery: false,
      })
    ).output.map((e) => e.output);
    const coins = collateralAddress.map((address) => `${chain}:${address}`);
    const prices = (await utils.getPrices(coins)).pricesByAddress;

    const _result = dataByChain.map((pool, index) => {
      const totalSupplyUsd =
        Number(pool.totalCollaterel) *
        prices[collateralAddress[index].toLowerCase()];
      const totalBorrowUsd = Number(pool.totalBorrowed) * mimPrice;
      return {
        pool: `${pool.address}-${chain}`,
        project: 'abracadabra',
        chain: utils.formatChain(chain),
        symbol: underlyings[index],
        apy: 0,
        tvlUsd: totalSupplyUsd,
        apyBaseBorrow: Number(pool.borrowFee),
        totalSupplyUsd: totalSupplyUsd,
        totalBorrowUsd: totalBorrowUsd,
        ltv: collateralRate[index] / 1000,
        mintedCoin: 'MIM',
      };
    });
    result.push(_result);
  }
  return result
    .flat()
    .filter((e) => e.tvlUsd)
    .filter((e) => e.totalSupplyUsd);
};

const main = async () => {
  const apy = await getApy();
  const cdp = await getCdp();
  return [...apy, ...cdp];
};

module.exports = {
  timetravel: false,
  apy: main,
  url: 'https://abracadabra.money/markets/farm',
};
