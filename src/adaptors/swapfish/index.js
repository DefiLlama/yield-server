const utils = require('../utils');
const sdk = require('@defillama/sdk');
const { default: BigNumber } = require('bignumber.js');
const superagent = require('superagent');
const masterChefABI = require('./abis/masterchef.json');
const lpABI = require('./abis/lp.json');

const FISH_TOKEN = '0xb348B87b23D5977E2948E6f36ca07E1EC94d7328';
const CHAINS = {
  arbitrum: {
    masterchef: '0x33141e87ad2DFae5FBd12Ed6e61Fa2374aAeD029',
  },
  bsc: {
    masterchef: '0x671eFBa3F6874485cC39535fa7b525fe764985e9',
  },
};

const getPairInfo = async (pair, tokenAddress, chain) => {
  const [tokenSymbol, tokenDecimals] = await Promise.all(
    ['erc20:symbol', 'erc20:decimals'].map((method) =>
      sdk.api.abi.multiCall({
        abi: method,
        calls: tokenAddress.map((address) => ({
          target: address,
        })),
        chain: chain,
        requery: true,
      })
    )
  );

  return {
    lpToken: pair.toLowerCase(),
    pairName: tokenSymbol.output.map((e) => e.output).join('-'),
    token0: {
      address: tokenAddress[0],
      symbol: tokenSymbol.output[0].output,
      decimals: tokenDecimals.output[0].output,
    },
    token1: {
      address: tokenAddress[1],
      symbol: tokenSymbol.output[1].output,
      decimals: tokenDecimals.output[1].output,
    },
  };
};

const getPrices = async (addresses, chain) => {
  const coins = addresses
    .map((address) => {
      // FISH is bridgeable, take price from the main chain
      const priceChain = address == FISH_TOKEN ? 'arbitrum' : chain;
      return `${priceChain}:${address}`;
    })
    .join(',')
    .toLowerCase();
  const prices = (
    await superagent.get(`https://coins.llama.fi/prices/current/${coins}`)
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

const calculateApy = (
  poolInfo,
  totalAllocPoint,
  FishPerSecond,
  FishPrice,
  reserveUSD
) => {
  const poolWeight = poolInfo.allocPoint / totalAllocPoint.output;
  const FishPerYear = FishPerSecond * 365 * 24 * 60 * 60;
  return ((poolWeight * FishPerYear * FishPrice) / reserveUSD) * 100;
};

const calculateReservesUSD = (
  reserves,
  reservesRatio,
  token0,
  token1,
  tokenPrices
) => {
  const { decimals: token0Decimals, address: token0Address } = token0;
  const { decimals: token1Decimals, address: token1Address } = token1;
  const token0Price = tokenPrices[token0Address.toLowerCase()];
  const token1Price = tokenPrices[token1Address.toLowerCase()];

  const reserve0 = new BigNumber(reserves._reserve0)
    .times(reservesRatio)
    .times(10 ** (18 - token0Decimals));
  const reserve1 = new BigNumber(reserves._reserve1)
    .times(reservesRatio)
    .times(10 ** (18 - token1Decimals));

  if (token0Price) return reserve0.times(token0Price).times(2);
  if (token1Price) return reserve1.times(token1Price).times(2);
};

const getApy = async () => {
  const poolsApy = [];

  for (chain in CHAINS) {
    masterchefAddress = CHAINS[chain]['masterchef'];

    const poolLength = await sdk.api.abi.call({
      target: masterchefAddress,
      chain: chain,
      abi: masterChefABI.find((e) => e.name === 'poolLength'),
    });
    const totalAllocPoint = await sdk.api.abi.call({
      target: masterchefAddress,
      chain: chain,
      abi: masterChefABI.find((e) => e.name === 'totalAllocPoint'),
    });
    const FishPerSecond = await sdk.api.abi.call({
      target: masterchefAddress,
      chain: chain,
      abi: masterChefABI.find((e) => e.name === 'cakePerSecond'),
    });
    const normalizedFishPerSecond = FishPerSecond.output / 1e18;

    const poolsRes = await sdk.api.abi.multiCall({
      abi: masterChefABI.filter(({ name }) => name === 'poolInfo')[0],
      calls: [...Array(Number(poolLength.output)).keys()].map((i) => ({
        target: masterchefAddress,
        params: i,
      })),
      chain: chain,
      requery: true,
    });

    const pools = poolsRes.output
      .map(({ output }, i) => ({ ...output, i }))
      .filter((e) => e.allocPoint !== '0')
      .filter(
        (k) =>
          ![
            '0xb348B87b23D5977E2948E6f36ca07E1EC94d7328',
            '0x666F4429681BeAfE36208FF9D0d16665755f488a',
            '0x089a4b6E7EF16e401C24DAE1e736dc33Ab8aDE52',
            '0x4CD8Ba83b30f3a39a5D63E086D31509399415b49',
          ].includes(k.lpToken)
      );
    const lpTokens = pools.map(({ lpToken }) => lpToken);

    const [reservesRes, supplyRes, masterChefBalancesRes] = await Promise.all(
      ['getReserves', 'totalSupply', 'balanceOf'].map((method) =>
        sdk.api.abi.multiCall({
          abi: lpABI.filter(({ name }) => name === method)[0],
          calls: lpTokens.map((address) => ({
            target: address,
            params: method === 'balanceOf' ? [masterchefAddress] : null,
          })),
          chain: chain,
          requery: true,
        })
      )
    );

    const [underlyingToken0, underlyingToken1] = await Promise.all(
      ['token0', 'token1'].map((method) =>
        sdk.api.abi.multiCall({
          abi: lpABI.filter(({ name }) => name === method)[0],
          calls: lpTokens.map((address) => ({
            target: address,
          })),
          chain: chain,
          requery: true,
        })
      )
    );

    const reservesData = reservesRes.output.map((res) => res.output);
    const supplyData = supplyRes.output.map((res) => res.output);
    const masterChefBalData = masterChefBalancesRes.output.map(
      (res, i) => res.output
    );
    const tokens0 = underlyingToken0.output.map((res) => res.output);
    const tokens1 = underlyingToken1.output.map((res) => res.output);
    const tokensPrices = await getPrices([...tokens0, ...tokens1], chain);
    const pairInfos = await Promise.all(
      pools.map((_, index) =>
        getPairInfo(lpTokens[index], [tokens0[index], tokens1[index]], chain)
      )
    );

    for (const [i, pool] of pools.entries()) {
      const pairInfo = pairInfos[i];
      const poolInfo = pool;
      const reserves = reservesData[i];
      const supply = supplyData[i];
      const masterChefBalance = masterChefBalData[i];

      const masterChefReservesUsd = calculateReservesUSD(
        reserves,
        masterChefBalance / supply,
        pairInfo.token0,
        pairInfo.token1,
        tokensPrices
      )
        .div(1e18)
        .toString();

      const apy = calculateApy(
        poolInfo,
        totalAllocPoint,
        normalizedFishPerSecond,
        tokensPrices[FISH_TOKEN.toLowerCase()],
        masterChefReservesUsd
      );

      poolsApy.push({
        pool: pool.lpToken,
        chain: utils.formatChain(chain),
        project: 'swapfish',
        symbol: `${pairInfo.token0.symbol}-${pairInfo.token1.symbol}`,
        tvlUsd: Number(masterChefReservesUsd),
        apyReward: apy,
        underlyingTokens: [tokens0[i], tokens1[i]],
        rewardTokens: [FISH_TOKEN],
      });
    }
  }

  return poolsApy;
};

module.exports = {
  timetravel: false,
  apy: getApy,
  url: 'https://swapfish.fi/',
};
