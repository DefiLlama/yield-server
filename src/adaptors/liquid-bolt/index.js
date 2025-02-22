const utils = require('../utils');
const sdk = require('@defillama/sdk');
const factoryAbi = require('./abis/factory.json');
const pairAbi = require('./abis/pair.json');
const tokenAbi = require('./abis/token.json');
const BigNumber = require('bignumber.js');

const CHAINS = [
  {
    chainId: 250,
    chain: 'fantom',
    factory: '0xdE08A0860B5971201f4d621B6eD4bb5BFed454be',
  },
  {
    chainId: 56,
    chain: 'bsc',
    factory: '0xBDEc20d9cdf8E222EDd536268A9883a4C2ca172D',
  },
  {
    chainId: 137,
    chain: 'polygon',
    factory: '0xF301aE81800Aa97f68148531D487696EF939170E',
  },
  {
    chainId: 42161,
    chain: 'arbitrum',
    factory: '0x3D225a66c4A609634fb2c2d75d30Fd6610EBb1BD',
  },
];

const formatReserve = (reserve, tokenAddress, tokenList) => {
  const token = tokenList.find((token) => token.address === tokenAddress);
  if (token === undefined) return 0;
  return BigNumber(reserve)
    .div(10 ** token.decimals)
    .toNumber();
};

const getLpsTvl = async (chain, factory, lps) => {
  // Tokens list
  const tokens = [];
  for (const lp of lps) {
    if (lp.chain_id === chain.chainId) {
      if (tokens.indexOf(lp.token0) === -1) {
        tokens.push(lp.token0);
      }
      if (tokens.indexOf(lp.token1) === -1) {
        tokens.push(lp.token1);
      }
    }
  }

  // Get token decimals
  const resultTokenDecimals = await sdk.api.abi.multiCall({
    chain: chain.chain,
    abi: tokenAbi.find((abi) => abi.name === 'decimals'),
    calls: tokens.map((address) => ({
      target: address,
    })),
    permitFailure: true,
  });

  // Format tokens array
  let tokenDecimals = [];
  for (let i = 0; i < tokens.length; i++) {
    tokenDecimals.push({
      address: tokens[i],
      decimals: Number(resultTokenDecimals.output[i].output),
    });
  }

  // Get pairs number
  const resultPair = await sdk.api.abi.multiCall({
    chain: chain.chain,
    abi: factoryAbi.find((abi) => abi.name === 'allPairsLength'),
    calls: [
      {
        target: factory,
      },
    ],
    permitFailure: true,
  });

  const nbPair = parseInt(resultPair.output[0].output);

  // Get pairs addresses
  const resultPairs = await sdk.api.abi.multiCall({
    chain: chain.chain,
    abi: factoryAbi.find((abi) => abi.name === 'allPairs'),
    calls: [...Array(nbPair).keys()].map((pairIndex) => ({
      target: factory,
      params: [pairIndex],
    })),
  });

  const pairAddresses = resultPairs.output.map(
    (pairResult) => pairResult.output
  );

  // Get pairs reserves
  const resultReserves = await sdk.api.abi.multiCall({
    chain: chain.chain,
    abi: pairAbi.find((abi) => abi.name === 'getReserves'),
    calls: pairAddresses.map((pairAddress) => ({
      target: pairAddress,
    })),
    permitFailure: true,
  });

  // Mapping results with our lps
  const reserves = resultReserves.output.map((pairResult) => ({
    address: pairResult.input.target,
    reserve0: pairResult.output._reserve0,
    reserve1: pairResult.output._reserve1,
    lp: lps.find(
      (lp) =>
        lp.lp_address === pairResult.input.target &&
        lp.chain_id === chain.chainId
    ),
  }));

  // Filter unwanted pairs
  const reservesFiltered = reserves.filter((item) => item.lp !== undefined);

  // Prepare data for utils.tvl function
  const formattedPairsData = reservesFiltered.map((item) => ({
    lpAddress: item.address,
    token0: {
      id: item.lp.token0.toLowerCase(),
    },
    token1: {
      id: item.lp.token1.toLowerCase(),
    },
    reserve0: formatReserve(item.reserve0, item.lp.token0, tokenDecimals),
    reserve1: formatReserve(item.reserve1, item.lp.token1, tokenDecimals),
  }));

  // Calculate lps tvl
  const poolsTvl = await utils.tvl(formattedPairsData, chain.chain);

  // Return addresses and tvls
  return lps.map((lp) => ({
    address: lp.lp_address,
    totalValueLockedUSD: Number(
      poolsTvl.find((item) => item.lpAddress === lp.lp_address)
        ?.totalValueLockedUSD
    ),
  }));
};

const getApy = async () => {
  const poolsApy = [];

  const data = await utils.getData(
    'https://stats.liquidbolt.finance/defillama-liquidbolt.json'
  );

  if (data !== undefined) {
    for (let lp of data.lps) {
      let chain = CHAINS.find((chain) => chain.chainId === lp.chain_id);
      if (chain !== undefined) {
        poolsApy.push({
          pool: lp.lp_address,
          chain: utils.formatChain(chain.chain),
          project: 'liquid-bolt',
          symbol: lp.name,
          tvlUsd: 0,
          apyBase: lp.apy_base,
          apyBase7d: lp.apy_base_7days,
          underlyingTokens: [lp.token0, lp.token1],
          rewardTokens: [lp.token0, lp.token1],
        });
      }
    }
    for (const chain of CHAINS) {
      let lpTvls = await getLpsTvl(chain, chain.factory, data.lps);
      poolsApy.forEach(function (pool) {
        const tvl = lpTvls.find((item) => item.address === pool.pool);
        pool.tvlUsd =
          tvl !== undefined && isFinite(tvl.totalValueLockedUSD)
            ? tvl.totalValueLockedUSD
            : pool.tvlUsd;
      });
    }
  }

  return poolsApy;
};

module.exports = {
  timetravel: false,
  apy: getApy,
  url: 'https://app.liquidbolt.finance/',
};
