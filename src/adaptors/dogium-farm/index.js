const utils = require('../utils');
const sdk = require('@defillama/sdk');
const { default: BigNumber } = require('bignumber.js');
const superagent = require('superagent');
const masterChefABI = require('./abis/masterchef.json');
const lpABI = require('./abis/lp.json');

const DogiumToken = '0x55bd2a3904c09547c3a5899704f1207ee61878be';
const DogiumUSDCLP = '0x6E08Bcb7c2289E6Aa0BD17d0dDED2D788ab2e8D5';
const MASTERCHEF_ADDRESS = '0x579BACCd9DdF3D9e652174c0714DBC0CD4700dF2';
const BLOCK_TIME = 2;
const SECOND_IN_YEAR = 86400 * 365;


const mapTokenDogeChaintoBSC = {
  '0x765277EebeCA2e31912C9946eAe1021199B39C61': '0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d', // USDC
  '0xB7ddC6414bf4F5515b52D8BdD69973Ae205ff101': '0xba2ae424d960c26247dd6c32edc70b295c744c43', // WWDOGE
  '0xE3F5a90F9cb311505cd691a46596599aA1A0AD7D': '0x55d398326f99059fF775485246999027B3197955', // usdt,
  '0x332730a4F6E03D9C55829435f10360E13cfA41Ff': '0xe9e7CEA3DedcA5984780Bafc599bD69ADd087D56', // busd,
  '0xA649325Aa7C5093d12D6F98EB4378deAe68CE23F': '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c', // bnb
};

const mapTokenBSCtoDogeChain = {
  '0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d': '0x765277EebeCA2e31912C9946eAe1021199B39C61',
  '0xba2ae424d960c26247dd6c32edc70b295c744c43': '0xB7ddC6414bf4F5515b52D8BdD69973Ae205ff101',
  '0x55d398326f99059ff775485246999027b3197955': '0xE3F5a90F9cb311505cd691a46596599aA1A0AD7D',
  '0xe9e7cea3dedca5984780bafc599bd69add087d56': '0x332730a4F6E03D9C55829435f10360E13cfA41Ff',
  '0xbb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c': '0xA649325Aa7C5093d12D6F98EB4378deAe68CE23F',
};

const EXCLUDE = [
  '0x55BD2a3904C09547c3A5899704f1207eE61878Be',
  '0xB7ddC6414bf4F5515b52D8BdD69973Ae205ff101',
  '0xE3F5a90F9cb311505cd691a46596599aA1A0AD7D',
  '0x765277EebeCA2e31912C9946eAe1021199B39C61',
  '0x7B4328c127B85369D9f82ca0503B000D09CF9180',
  '0xB44a9B6905aF7c801311e8F4E76932ee959c663C',
];


const getPriceByReserves = async (lpAddress) => {
  const reserves = await sdk.api.abi.call({
    target: lpAddress,
    chain: 'dogechain',
    abi: lpABI.find((e) => e.name === 'getReserves'),
  });
  return ((reserves.output[1] / reserves.output[0]));
};

const getPairInfo = async (pair, tokenAddress) => {
  const [tokenSymbol, tokenDecimals] = await Promise.all(
    ['erc20:symbol', 'erc20:decimals'].map((method) =>
      sdk.api.abi.multiCall({
        abi: method,
        calls: tokenAddress.map((address) => ({
          target: address,
        })),
        chain: 'dogechain',
        requery: true,
      }
    )
  ));
  return {
    lpToken: pair.toLowerCase(),
    pairName: tokenSymbol.output.map(e => e.output).join('-'),
    token0: {
      address: tokenAddress[0],
      symbol: tokenSymbol.output[0].output,
      decimals: tokenDecimals.output[0].output
    },
    token1: {
      address: tokenAddress[1],
      symbol: tokenSymbol.output[1].output,
      decimals: tokenDecimals.output[1].output
    }
  };
}

const getPrices = async (addresses) => {
  const prices = (
    await superagent.post('https://coins.llama.fi/prices').send({
      coins: addresses.map((address) => `bsc:${mapTokenDogeChaintoBSC[address]}`),
    })
  ).body.coins;
  const pricesObj = Object.entries(prices).reduce(
    (acc, [address, price]) => ({
      ...acc,
      [mapTokenBSCtoDogeChain[address.split(':')[1]].toLowerCase()]: price.price,
    }),
    {}
  );

  return pricesObj;
};

const calculateApy = (
  poolInfo,
  totalAllocPoint,
  dogiumPerSecond,
  dogiumPrice,
  reserveUSD
) => {
  const poolWeight = poolInfo.allocPoint / totalAllocPoint.output;
  const dogiumPerYear = BigNumber(dogiumPerSecond)
    .times(SECOND_IN_YEAR)
    .times(poolWeight);
  const apy = dogiumPerYear
    .times(dogiumPrice)
    .div(reserveUSD)
    .times(100);
  return apy.toNumber();
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
  const poolLength = await sdk.api.abi.call({
    target: MASTERCHEF_ADDRESS,
    chain: 'dogechain',
    abi: masterChefABI.find((e) => e.name === 'poolLength'),
  });
  const totalAllocPoint = await sdk.api.abi.call({
    target: MASTERCHEF_ADDRESS,
    chain: 'dogechain',
    abi: masterChefABI.find((e) => e.name === 'totalAllocPoint'),
  });
  const dogiumPerBlock = await sdk.api.abi.call({
    target: MASTERCHEF_ADDRESS,
    chain: 'dogechain',
    abi: masterChefABI.find((e) => e.name === 'dogiumPerSecond'),
  });
  const normalizeddogiumPerBlock = dogiumPerBlock.output / 1e18;

  const poolsRes = await sdk.api.abi.multiCall({
    abi: masterChefABI.filter(({ name }) => name === 'poolInfo')[0],
    calls: [...Array(Number(poolLength.output)).keys()].map((i) => ({
      target: MASTERCHEF_ADDRESS,
      params: i,
    })),
    chain: 'dogechain',
    requery: true,
  });

  const pools = poolsRes.output
  .map(({ output }, i) => ({ ...output, i }))
  .filter((e) => e.allocPoint !== '0')
  .filter((k) => !EXCLUDE.includes(k.lpToken))

  const lpTokens = pools.map(({ lpToken }) => lpToken)
  const [reservesRes, supplyRes, masterChefBalancesRes] = await Promise.all(
    ['getReserves', 'totalSupply', 'balanceOf'].map((method) =>
      sdk.api.abi.multiCall({
        abi: lpABI.filter(({ name }) => name === method)[0],
        calls: lpTokens.map((address) => ({
          target: address,
          params: method === 'balanceOf' ? [MASTERCHEF_ADDRESS] : null,
        })),
        chain: 'dogechain',
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
        chain: 'dogechain',
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
  const tokensPrices = await getPrices([...tokens0, ...tokens1]);
  const pairInfos = await Promise.all(pools.map((_, index) => getPairInfo(lpTokens[index], [tokens0[index], tokens1[index]])));

  const gogium = await getPriceByReserves(DogiumUSDCLP);
  tokensPrices[DogiumToken.toLowerCase()] = gogium * 10**12;

  const res = pools.map((pool, i) => {
    const poolInfo = pool;
    const reserves = reservesData[i];
    const pairInfo = pairInfos[i];

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

    const apyReward = calculateApy(
      poolInfo,
      totalAllocPoint,
      normalizeddogiumPerBlock,
      tokensPrices[DogiumToken.toLowerCase()],
      masterChefReservesUsd
    );

    return {
      pool: pool.lpToken + '-dogechain',
      chain: utils.formatChain('dogechain'),
      project: 'dogium-farm',
      symbol: `${pairInfo.token0.symbol}-${pairInfo.token1.symbol}`,
      tvlUsd: Number(masterChefReservesUsd),
      apyReward,
      underlyingTokens: [tokens0[i], tokens1[i]],
      rewardTokens: [DogiumToken],
    };
  });

  return res.filter((p) => utils.keepFinite(p));
};

module.exports = {
  timetravel: false,
  apy: getApy,
  url: 'https://lithium.dog/',
};
