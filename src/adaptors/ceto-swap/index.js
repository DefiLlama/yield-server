const LPAbi = require('./abi/LP.json');
const ERC20Abi = require('./abi/ERC20.json');
const MasterChefAbi = require('./abi/MasterChef.json');
const ERC20MasterChefAbi = require('./abi/ERC20MasterChef.json');
const utils = require('../utils');
const BigNumber = require('bignumber.js');
const sdk = require('@defillama/sdk');

const pools = {
  usdex_plus_usdc: {
    address: '0x3838753b9b9b7cf26ddc71d0f1a0ee0b9144aba5',
    pid: 0,
  },
  weth_usdc: {
    address: '0xd6359083da64e79ad7c54106ee71a889268f0462',
    pid: 5,
  },
  stone_weth: {
    address: '0x05db409bc3c2629e2987dc7aa87c39376bc49477',
    pid: 7,
  },
  ceto_usdex_plus: {
    address: '0xef799451a28a1432712d19df82e512d985d685d4',
    pid: 1,
  },
  ceto_weth: {
    address: '0x6c72baee6d7074e54add3f617ec5d6b22afe779b',
    pid: 4,
  },
  bceto_weth: {
    address: '0x3afed5925034bb3b730ffdae6d98b6df45c0ff74',
    pid: 6,
  },
  manta_weth: {
    address: '0xb9454b5fc78c826cf028f4e513b0e0a4d2bf51a9',
    pid: 2,
  },
  stgai_manta: {
    address: '0x75791775dc127d4441ecc532be128214ca4c6f72',
    pid: 3,
  },
}

const TOKEN = {
  USDC: '0xb73603c5d87fa094b7314c74ace2e64d165016fb',
  CETO: '0x3af03e8c993900f0ea6b84217071e1d4cc783982'
}

const PROJECT_SLUG = 'ceto-swap'
const MASTERCHEF_ADDRESS = '0x78343ABFC1381D4358161c2f73Fc0990CCD5cbE0';
const BLOCKS_PER_YEAR = 31536000;

function setPrices(prices, info) {
  const tokenPrice0 = prices[info.token0.toLowerCase()]
  const tokenPrice1 = info.token1.toLowerCase() === TOKEN.USDC ? 1 : prices[info.token1.toLowerCase()]
  const token1ReservesBN = new BigNumber(info.reserves[1]).div(info.token1.toLowerCase() === TOKEN.USDC ? 1e6 : 1e18);
  const token0ReservesBN = new BigNumber(info.reserves[0]).div(1e18);
  if (!tokenPrice0) {
    const reserve = token1ReservesBN.times(tokenPrice1);
    const priceBN = reserve.div(token0ReservesBN);
    prices[info.token0.toLowerCase()] = priceBN;
  } else if (!tokenPrice1) {
    const reserve = token0ReservesBN.times(tokenPrice0);
    const priceBN = reserve.div(token1ReservesBN);
    prices[info.token1.toLowerCase()] = priceBN
  }
}

async function getLpTotalAmount(pool, quoteToken) {
  const [
    { output: quoteTokenBlanceLP },
    { output: lpTokenBalanceMC },
    { output: lpTotalSupply },
    { output: quoteTokenDecimals }
  ] = await Promise.all([
    sdk.api.abi.call({
      target: quoteToken,
      chain: 'manta',
      abi: ERC20MasterChefAbi[0],
      params: [pool.address]
    }),
    sdk.api.abi.call({
      target: pool.address,
      chain: 'manta',
      abi: ERC20MasterChefAbi[0],
      params: [MASTERCHEF_ADDRESS]
    }),
    sdk.api.abi.call({
      target: pool.address,
      chain: 'manta',
      abi: ERC20MasterChefAbi[2],
    }),
    sdk.api.abi.call({
      target: quoteToken,
      chain: 'manta',
      abi: ERC20MasterChefAbi[1],
    }),
  ]);
  const lpTokenRatio = new BigNumber(lpTokenBalanceMC).div(lpTotalSupply);
  const lpTotal = new BigNumber(quoteTokenBlanceLP)
    .div(new BigNumber(10).pow(quoteTokenDecimals))
    .times(2)
    .times(lpTokenRatio)
  return lpTotal;
}

async function getApy(pool, info, prices) {
  const [
    { output: poolInfo },
    { output: totalAllocPoint },
    { output: sharesPerSecond }
  ] = await Promise.all([
    sdk.api.abi.call({
      target: MASTERCHEF_ADDRESS,
      chain: 'manta',
      abi: MasterChefAbi[0],
      params: [pool.pid]
    }),
    sdk.api.abi.call({
      target: MASTERCHEF_ADDRESS,
      chain: 'manta',
      abi: MasterChefAbi[1],
    }),
    sdk.api.abi.call({
      target: MASTERCHEF_ADDRESS,
      chain: 'manta',
      abi: MasterChefAbi[2],
    }),
  ])
  const allocPoint = new BigNumber(poolInfo[1].toString());
  const poolWeight = allocPoint.div(new BigNumber(totalAllocPoint));
  const rewardPerBlock = poolWeight.times(sharesPerSecond || 10).div(10 ** 18);
  const rewardPerYear = rewardPerBlock.times(BLOCKS_PER_YEAR);
  const price0 = prices[info.token0.toLowerCase()];
  const price1 = prices[info.token1.toLowerCase()];
  const quoteToken = price0 ? info.token0.toLowerCase() : info.token1.toLowerCase();
  const lpTotal = await getLpTotalAmount(pool, quoteToken);
  const apyInCeto = rewardPerYear.times(prices[TOKEN.CETO]);
  const totalValue = lpTotal.times(price0 || price1);
  const apy = apyInCeto.div(totalValue);
  return apy;
}

async function getPoolsInfo() {
  const poolsInfo = {};
  for (const pool of Object.values(pools)) {
    const poolAddress = pool.address;
    const [
      { output: totalSupply },
      { output: reserves },
      { output: token0 },
      { output: token1 },
      { output: decimals }
    ] = await Promise.all([
      sdk.api.abi.call({
        target: poolAddress,
        chain: 'manta',
        abi: LPAbi[0],
      }),
      sdk.api.abi.call({
        target: poolAddress,
        chain: 'manta',
        abi: LPAbi[1],
      }),
      sdk.api.abi.call({
        target: poolAddress,
        chain: 'manta',
        abi: LPAbi[2],
      }),
      sdk.api.abi.call({
        target: poolAddress,
        chain: 'manta',
        abi: LPAbi[3],
      }),
      sdk.api.abi.call({
        target: poolAddress,
        chain: 'manta',
        abi: LPAbi[4],
      }),
    ])
    poolsInfo[poolAddress.toLowerCase()] = {
      totalSupply,
      reserves: { 0: reserves['0'], 1: reserves['1'] },
      token0: token0.toLowerCase(),
      token1: token1.toLowerCase(),
      decimals,
    }
  }
  const prices = {}
  const tvl = {};
  for (const pool of Object.values(pools)) {
    const poolAddress = pool.address;
    const info = poolsInfo[poolAddress.toLowerCase()];
    const [{ output: symbol0 }, { output: symbol1 }] = await Promise.all([
      sdk.api.abi.call({
        target: info.token0,
        chain: 'manta',
        abi: ERC20Abi[0],
      }),
      sdk.api.abi.call({
        target: info.token1,
        chain: 'manta',
        abi: ERC20Abi[0],
      })
    ])
    const symbol = `${symbol0}/${symbol1}`;
    setPrices(prices, info);
    const price0 = prices[info.token0.toLowerCase()];
    const price1 = prices[info.token1.toLowerCase()];
    const token0ReservesBN = new BigNumber(info.reserves[0]).div(1e18);
    const token1ReservesBN = new BigNumber(info.reserves[1]).div(info.token1.toLowerCase() === TOKEN.USDC ? 1e6 : 1e18);
    const tvl0BN = price0.times(token0ReservesBN);
    const tvl1BN = price0.times(token0ReservesBN);
    const tvlUsd = tvl0BN.plus(tvl1BN).toNumber();
    tvl[poolAddress] = {
      pool: poolAddress,
      chain: utils.formatChain('manta'),
      project: PROJECT_SLUG,
      symbol,
      tvlUsd,
      url: 'https://cetoswap.com/#/farms',
    }
  }
  const res = [];
  for (const pool of Object.values(pools)) {
    const poolAddress = pool.address;
    const currentTvl = tvl[poolAddress];
    const info = poolsInfo[poolAddress.toLowerCase()];
    const apy = await getApy(pool, info, prices);
    res.push({
      ...currentTvl,
      apy: apy.times(100).toNumber(),
    })
  }
  return res;
}


module.exports = {
  apy: getPoolsInfo,
};