const sdk = require('@defillama/sdk');
const { Web3 } = require('web3');
const superagent = require('superagent');
const { masterChefABI, lpABI } = require('./abis');
const utils = require('../utils');

const MASTERCHEF_ADDRESS = '0x8eE78D4836B44944D393941A736b6DC23e33bc69';
const sBASE = '0x616F5b97C22Fa42C3cA7376F7a25F0d0F598b7Bb';
const WETH = '0x4200000000000000000000000000000000000006';
const sBASE_WETH_LP = '0xd072a63c2d54b49229a4557b3aeb1cbe04eb6b2e';

const RPC_URL = 'https://mainnet.base.org';
const web3 = new Web3(RPC_URL);

const poolStaticData = {
  '0x5626f9217e774eabebb86821f5fbe6e8ed0770dc': {
    tokens: 'USDC-DAI-axlUSD',
  },
  [sBASE_WETH_LP]: {
    tokens: 'sBASE-WETH',
  },
  '0x890cff90ee1c24b0a2264e5d3618bfdec05b077c': {
    tokens: 'USDC-USDbC',
  },
};

const getPrice = async () => {
  const lpContract = new web3.eth.Contract(lpABI, sBASE_WETH_LP);
  const sBASEreserves = await lpContract.methods.getReserves().call();
  const totalSupply = await lpContract.methods.totalSupply().call();

  // WETH Price
  const ethPriceRes = (
    await superagent.get(
      `https://coins.llama.fi/prices/current/base:${WETH.toLowerCase()}`
    )
  ).body.coins;
  const ethPrice = ethPriceRes[`base:${WETH}`]?.price;

  // sBASE Price
  const reserve1 = sBASEreserves[0];
  const reserve0 = sBASEreserves[1];
  const sBASE_IN_ETH = Number(reserve1) / Number(reserve0);
  const sBasePrice = sBASE_IN_ETH * ethPrice;

  // sBASE-WETH LP Price
  const token0total = Number(
    Number(sBasePrice * (Number(reserve0) / 10 ** 18)).toString()
  );
  const token1total = Number(
    Number(ethPrice * (Number(reserve1) / 10 ** 18)).toString()
  );
  const lpTotalPrice = Number(token0total + token1total);
  const lpPrice = lpTotalPrice / (Number(totalSupply) / 10 ** 18);

  return { sBasePrice, ethPrice, lpPrice };
};

const main = async () => {
  const { sBasePrice, ethPrice, lpPrice } = await getPrice();
  const masterChef = new web3.eth.Contract(masterChefABI, MASTERCHEF_ADDRESS);

  const poolsCount = await masterChef.methods.poolLength().call();
  const totalAllocPoint = Number(
    await masterChef.methods.totalAllocPoint().call()
  );
  const perSec = Number(await masterChef.methods.sBasePerSec().call()) / 1e18;

  const poolsRes = await sdk.api.abi.multiCall({
    abi: masterChefABI.filter(({ name }) => name === 'poolInfo')[0],
    calls: [...Array(Number(poolsCount)).keys()].map((i) => ({
      target: MASTERCHEF_ADDRESS,
      params: i,
    })),
    chain: 'base',
  });

  const pools = poolsRes.output.map(({ output }, i) => ({ ...output, i }));

  const response = pools.map((pool, index) => {
    const allocPoint = pool[1];
    const _tvl = pool[6];
    const numerator = allocPoint * perSec * 86400;
    const denominator = totalAllocPoint;
    const rewardPerDay = numerator / denominator;
    const rewardPerYear = rewardPerDay * 365 * 100;
    let apy = 0;
    let tvl = _tvl / 1e18;
    if (index === 1) {
      tvl = (_tvl / 1e18) * lpPrice;
      apy = (rewardPerYear * sBasePrice) / tvl;
    } else {
      apy = (rewardPerYear * sBasePrice) / tvl;
    }
    return {
      pool: pool[0],
      chain: utils.formatChain('base'),
      project: 'stablebase',
      symbol: poolStaticData[pool[0].toLowerCase()].tokens,
      tvlUsd: tvl,
      apyReward: apy,
      rewardTokens: [sBASE],
    };
  });

  return response;
};

module.exports = {
  timetravel: false,
  apy: main,
  url: 'https://stablebase.fi/farm',
};
