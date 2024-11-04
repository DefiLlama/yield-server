const { Web3 } = require('web3');
const { default: BigNumber } = require('bignumber.js');
const sdk = require('@defillama/sdk');

const { masterChefABI, lpTokenABI } = require('./abis');
const utils = require('../utils');
const { fetchURL } = require('../../helper/utils');

const RPC_URL = 'https://bsc-dataseed1.binance.org/';
const LP_APRS =
  'https://raw.githubusercontent.com/pancakeswap/pancake-frontend/develop/apps/web/src/config/constants/lpAprs/56.json';
const MASTERCHEF_ADDRESS = '0xa5f8C5Dbd5F286960b9d90548680aE5ebFf07652';
const CAKE = '0x0e09fabb73bd3ade0a17ecc321fd13a19e81ce82';

const BSC_BLOCK_TIME = 3;
const BLOCKS_PER_YEAR = (60 / BSC_BLOCK_TIME) * 60 * 24 * 365;

const web3 = new Web3(RPC_URL);

const calculateApy = (
  poolInfo,
  totalAllocPoint,
  cakePerBlock,
  cakePrice,
  reserveUSD
) => {
  const poolWeight = poolInfo.allocPoint / Number(totalAllocPoint);
  const cakePerYear = BLOCKS_PER_YEAR * Number(cakePerBlock);

  return ((poolWeight * cakePerYear * cakePrice) / reserveUSD) * 100;
};

const calculateReservesUSD = (
  pairName,
  reserves,
  reservesRatio,
  bnbPrice,
  cakePrice,
  ethPrice,
  token0decimals,
  token1decimals
) => {
  const [token0, token1] = pairName.split('-');
  const reserve0 = new BigNumber(reserves._reserve0)
    .times(reservesRatio)
    .times(10 ** (18 - token0decimals));
  const reserve1 = new BigNumber(reserves._reserve1)
    .times(reservesRatio)
    .times(10 ** (18 - token1decimals));

  if (token0.includes('USD')) return reserve0.times(2);
  if (token0.includes('BNB')) return reserve0.times(bnbPrice).times(2);
  if (token0.includes('Cake')) return reserve0.times(cakePrice).times(2);
  if (token0.includes('ETH')) return reserve0.times(ethPrice).times(2);
  if (token1.includes('USD')) return reserve1.times(2);
  if (token1.includes('BNB')) return reserve1.times(bnbPrice).times(2);
  if (token1.includes('Cake')) return reserve1.times(cakePrice).times(2);
  if (token1.includes('ETH')) return reserve1.times(ethPrice).times(2);
};

const getBaseTokensPrice = async () => {
  const priceKeys = {
    bnb: '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c',
    eth: '0x2170Ed0880ac9A755fd29B2688956BD959F933F8',
    cake: '0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82',
  };
  const prices = (
    await utils.getData(
      `https://coins.llama.fi/prices/current/${Object.values(priceKeys).map(
        (t) => `bsc:${t}`
      )}`
    )
  ).coins;

  const cakePrice = prices[`bsc:${priceKeys.cake}`].price;
  const ethPrice = prices[`bsc:${priceKeys.eth}`].price;
  const bnbPrice = prices[`bsc:${priceKeys.bnb}`].price;

  return { cakePrice, ethPrice, bnbPrice };
};

const main = async () => {
  const { cakePrice, ethPrice, bnbPrice } = await getBaseTokensPrice();
  const masterChef = new web3.eth.Contract(masterChefABI, MASTERCHEF_ADDRESS);
  let { data: lpAprs } = await fetchURL(LP_APRS);
  lpAprs = Object.fromEntries(
    Object.entries(lpAprs).map(([k, v]) => [k.toLowerCase(), v])
  );

  const poolsCount = await masterChef.methods.poolLength().call();
  const totalAllocPoint = await masterChef.methods
    .totalRegularAllocPoint()
    .call();
  const cakeRateToRegularFarm = await masterChef.methods
    .cakePerBlock(true)
    .call();
  const normalizedCakePerBlock = cakeRateToRegularFarm / BigInt(1e18);

  const [poolsRes, lpTokensRes] = await Promise.all(
    ['poolInfo', 'lpToken'].map((method) =>
      sdk.api.abi.multiCall({
        abi: masterChefABI.filter(({ name }) => name === method)[0],
        calls: [...Array(Number(poolsCount) - 1).keys()].map((i) => ({
          target: MASTERCHEF_ADDRESS,
          params: i,
        })),
        chain: 'bsc',
        permitFailure: true,
      })
    )
  );
  const poolsInfo = poolsRes.output.map((res) => res.output);
  const lpTokens = lpTokensRes.output.map((res) => res.output);

  // note: exchange subgraph is broken giving duplicated ids on pairs
  // reading token info data from contracts instead
  const [reservesRes, supplyRes, masterChefBalancesRes, token0Res, token1Res] =
    await Promise.all(
      ['getReserves', 'totalSupply', 'balanceOf', 'token0', 'token1'].map(
        (method) =>
          sdk.api.abi.multiCall({
            abi: lpTokenABI.filter(({ name }) => name === method)[0],
            calls: lpTokens.map((address) => ({
              target: address,
              params: method === 'balanceOf' ? [MASTERCHEF_ADDRESS] : null,
            })),
            chain: 'bsc',
            permitFailure: true,
          })
      )
    );
  const reservesData = reservesRes.output.map((res) => res.output);
  const supplyData = supplyRes.output.map((res) => res.output);
  const masterChefBalData = masterChefBalancesRes.output.map(
    (res) => res.output
  );
  const token0 = token0Res.output.map((res) => res.output);
  const token1 = token1Res.output.map((res) => res.output);

  const symbol0 = (
    await sdk.api.abi.multiCall({
      abi: 'erc20:symbol',
      calls: token0.map((t) => ({ target: t })),
      chain: 'bsc',
      permitFailure: true,
    })
  ).output.map((o) => o.output);

  const symbol1 = (
    await sdk.api.abi.multiCall({
      abi: 'erc20:symbol',
      calls: token1.map((t) => ({ target: t })),
      chain: 'bsc',
      permitFailure: true,
    })
  ).output.map((o) => o.output);

  // decimals
  const decimals0 = (
    await sdk.api.abi.multiCall({
      abi: 'erc20:decimals',
      calls: token0.map((t) => ({ target: t })),
      chain: 'bsc',
      permitFailure: true,
    })
  ).output.map((o) => o.output);
  const decimals1 = (
    await sdk.api.abi.multiCall({
      abi: 'erc20:decimals',
      calls: token1.map((t) => ({ target: t })),
      chain: 'bsc',
      permitFailure: true,
    })
  ).output.map((o) => o.output);

  const pools = await Promise.all(
    poolsInfo.map((pool, i) => {
      // the first two pools are for lotteries, etc.
      if (i < 2) return;
      if (!reservesData[i]) return;
      if (!symbol0[i] || !symbol1[i]) return null;

      const symbol = symbol0[i] + '-' + symbol1[i];
      const poolInfo = poolsInfo[i];
      const reserves = reservesData[i];

      const supply = supplyData[i];
      const masterChefBalance = masterChefBalData[i];

      const reserveUSD = calculateReservesUSD(
        symbol,
        reserves,
        masterChefBalance / supply,
        bnbPrice,
        cakePrice,
        ethPrice,
        decimals0[i],
        decimals1[i]
      )
        .div(1e18)
        .toString();
      const apyReward = calculateApy(
        poolInfo,
        totalAllocPoint,
        normalizedCakePerBlock,
        cakePrice,
        reserveUSD
      );
      return {
        pool: lpTokens[i].toLowerCase(),
        chain: utils.formatChain('binance'),
        project: 'pancakeswap-amm',
        symbol,
        tvlUsd: Number(reserveUSD),
        apyBase: lpAprs[lpTokens[i].toLowerCase()],
        apyReward,
        rewardTokens: apyReward > 0 ? [CAKE] : [],
        underlyingTokens: [token0[i], token1[i]],
      };
    })
  );

  // rmv null elements
  return pools.filter(Boolean).filter((i) => utils.keepFinite(i));
};

module.exports = {
  timetravel: false,
  apy: main,
  url: 'https://pancakeswap.finance/farms',
};
