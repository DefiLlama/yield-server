const sdk = require('@defillama/sdk');
const utils = require('../utils');
const { BigNumber } = require('ethers');
// const { default: BigNumber } = require('bignumber.js');
const { transformMilkomedaAddress } = require('../../helper/transform');

const abi = require('./abi.json');

const API_URL = 'https://api.blueshift.fi/api/portfolio/fee';

const REGISTRY_CONTRACT = '0x83E384d119adA05195Caca26396B8f56fdDA1c91';
const MINTER_CONTRACT = '0xdE6AB15d0786a0034B28Ed7e6B21ed95099CF48B';
const MANUAL_POOL_CONTRACT = '0xA4f0e3C80C77b347250B9D3999478E305FF814A4';

const BLOCKS_PER_YEAR = 8e6;

const MONTHS_IN_YEAR = 12;
const DAYS_IN_YEAR = 365;
const NUMBER_OF_PERIODS = DAYS_IN_YEAR;


function formatBigNumber(num, decimals) {
  if (num.length > decimals) {
    return num.slice(0, num.length - decimals) + '.' + num.slice(num.length - decimals)
  } else {
    return "0." + '0'.repeat(decimals - num.length) + num
  }
}

async function getFees(portfolios) {
  const res = {};

  const fees = (await utils.getData(
    API_URL,
    {
      portfolio: portfolios,
      period: 30
    }
  )).fee;

  for (let i = 0; i < fees.length; ++i) {
    res[portfolios[i]] = fees[i];
  }

  return res;
}

async function getBluesPrice() {
  const bluesPrice = (await utils.getData(
    'https://api.coingecko.com/api/v3/simple/price?ids=blueshift&vs_currencies=usd'
  )).blueshift.usd;

  const [i, f] = bluesPrice.toString().split('.');

  if (f === undefined) {
    return BigNumber.from(i + '0'.repeat(6));
  } else {
    return BigNumber.from(i + f.slice(0, 6) + '0'.repeat(f.length < 6 ? 6 - f.length : 0));
  }
}

function apy(apr, aprWeights) {
  const apr1 = apr * Number(formatBigNumber(aprWeights[0], 4));
  const apr2 = apr * (Number(formatBigNumber(aprWeights[1], 4)) + Number(formatBigNumber(aprWeights[2], 4)));

  const apy1 = (1 + apr1 / NUMBER_OF_PERIODS)**(NUMBER_OF_PERIODS);

  // console.log("weight1:", Number(formatBigNumber(aprWeights[0], 4)));
  // console.log("weight2:", Number(formatBigNumber(aprWeights[1], 4)));
  // console.log("weight3:", Number(formatBigNumber(aprWeights[2], 4)));
  // console.log("apr1:", apr1);
  // console.log("apr2:", apr2);
  // console.log("apy1:", apy1);

  return apy1 + apr2 / apr1 * (apy1 - 1) - 1;
}

async function farming(aprWeights, rewardToken, BLUES_PRICE, portfolios) {
  const res = [];
  const transform = await transformMilkomedaAddress();

  const fees = await getFees(portfolios.map(portfolio => portfolio.contractAddress));

  const farms = (await sdk.api.abi.call({
    abi: abi.BlueshiftMinter.getFarms,
    chain: 'milkomeda',
    target: MINTER_CONTRACT,
    params: [],
    // block: chainBlocks['milkomeda'],
  })).output;

  const farmInfos = (await sdk.api.abi.call({
    abi: abi.BlueshiftMinter.getStatusFarms,
    chain: 'milkomeda',
    target: MINTER_CONTRACT,
    params: [
      "0x0000000000000000000000000000000000000000",
      (await sdk.api.util.getLatestBlock("milkomeda")).number
    ],
    // block: chainBlocks['milkomeda'],
  })).output;

  for (let farm of farms) {
    const receivedToken = (await sdk.api.abi.call({
      abi: abi.BlueshiftEarning.getToken,
      chain: 'milkomeda',
      target: farm,
      params: [],
      // block: chainBlocks['milkomeda'],
    })).output;

    const portfolioInfo = portfolios.filter(portfolio => portfolio.lpTokenAddress === receivedToken)[0];
    if (portfolioInfo === undefined) {
      continue;
    }

    const farmInfo = farmInfos.filter(farmInfo => farmInfo.farm === farm)[0];
    if (farmInfo === undefined) {
      continue;
    }

    const tokensAddresses = portfolioInfo.tokens.map(token => token.tokenAddress)

    const tokensSymbols = (await sdk.api.abi.multiCall({
      abi: abi.ERC20.symbol,
      chain: 'milkomeda',
      calls: tokensAddresses.map(tokenAddress => ({
        target: tokenAddress,
        params: []
      })),
      // block: chainBlocks['milkomeda'],
      requery: true,
    })).output.map(s => s.output);

    const rewardedFee = Number(formatBigNumber(BigNumber.from(fees[portfolioInfo.contractAddress]).mul(MONTHS_IN_YEAR).toString(), 6));
    const rewardedStake = Number(formatBigNumber(BigNumber.from(farmInfo.rewardPerBlock).mul(BLOCKS_PER_YEAR).mul(BLUES_PRICE).div(BigNumber.from(10).pow(18)).toString(), 6));

    const depositedBalances = {};
    await sdk.util.sumSingleBalance(
      depositedBalances,
      transform(portfolioInfo.baseTokenAddress),
      BigNumber.from(farmInfo.accDeposited).mul(BigNumber.from(portfolioInfo.lpTokenPrice)).div(BigNumber.from(10).pow(18)).toString()
    );
    const deposited = (await sdk.util.computeTVL(depositedBalances, "now")).usdTvl;

    const aprBase = rewardedFee / deposited;
    const aprReward = rewardedStake / deposited;

    const apyBase = tokensAddresses.includes(rewardToken) ? apy(aprBase, aprWeights) : aprBase; 
    const apyReward = tokensAddresses.includes(rewardToken) ? apy(aprReward, aprWeights) : aprReward;

    // console.log(tokensSymbols);
    // console.log("aprBase:", aprBase.toString());
    // console.log("aprReward:", aprReward.toString());
    // console.log("apyBase:", apyBase.toString());
    // console.log("apyReward:", apyReward.toString());

    let tvl = (await sdk.api.erc20.balanceOf({
      chain: 'milkomeda',
      target: receivedToken,
      owner: farm,
      // block: chainBlocks['milkomeda']
    })).output;
    tvl = BigNumber.from(tvl).mul(BigNumber.from(portfolioInfo.lpTokenPrice)).div(BigNumber.from(10).pow(18));

    const balances = {};
    await sdk.util.sumSingleBalance(balances, transform(portfolioInfo.baseTokenAddress), tvl.toString());
    const tvlUsd = (await sdk.util.computeTVL(balances, "now")).usdTvl;

    res.push({
      pool: `${farm}`.toLowerCase(),
      chain: utils.formatChain('milkomeda'),
      project: 'blueshift',
      symbol: `${portfolioInfo.name} (${tokensSymbols.join('-')})`,
      apyBase: aprBase * 100,
      apyReward: aprReward * 100,
      tvlUsd: tvlUsd,
      rewardTokens: [rewardToken],
      underlyingTokens: tokensAddresses,
      url: 'https://app.blueshift.fi/#/farming'
    });
  }

  return res;
}

async function staking(aprWeights, rewardToken, BLUES_PRICE, portfolios) {
  const res = [];
  const transform = await transformMilkomedaAddress();

  const stakings = (await sdk.api.abi.call({
    abi: abi.BlueshiftMinter.getStakings,
    chain: 'milkomeda',
    target: MINTER_CONTRACT,
    params: [],
    // block: chainBlocks['milkomeda'],
  })).output;

  // console.log(stakings);

  const stakingInfos = (await sdk.api.abi.call({
    abi: abi.BlueshiftMinter.getStatusStaking,
    chain: 'milkomeda',
    target: MINTER_CONTRACT,
    params: [
      "0x0000000000000000000000000000000000000000",
      (await sdk.api.util.getLatestBlock("milkomeda")).number
    ],
    // block: chainBlocks['milkomeda'],
  })).output;

  for (let staking of stakings) {
    const receivedToken = (await sdk.api.abi.call({
      abi: abi.BlueshiftEarning.getToken,
      chain: 'milkomeda',
      target: staking,
      params: [],
      // block: chainBlocks['milkomeda'],
    })).output;

    const stakingInfo = stakingInfos.filter(stakingInfo => stakingInfo.farm === staking)[0];
    if (stakingInfo === undefined) {
      continue;
    }

    const aprReward = BigNumber.from(stakingInfo.rewardPerBlock).mul(BLOCKS_PER_YEAR)
      .mul(10000)
      .div(BigNumber.from(stakingInfo.accDeposited));

    const apyReward = apy(Number(formatBigNumber(aprReward.toString(), 4)), aprWeights);

    // console.log("aprReward:", formatBigNumber(aprReward.toString(), 4));
    // console.log("apyReward:", apyReward.toString());

    let tvl = (await sdk.api.erc20.balanceOf({
      chain: 'milkomeda',
      target: receivedToken,
      owner: staking,
      // block: chainBlocks['milkomeda']
    })).output;

    const tvlUsd = BigNumber.from(tvl).mul(BLUES_PRICE).div(BigNumber.from(10).pow(18)).toString();

    res.push({
      pool: `${staking}`.toLowerCase(),
      chain: utils.formatChain('milkomeda'),
      project: 'blueshift',
      symbol: 'BLUES',
      apyBase: null,
      apyReward: apyReward * 100,
      tvlUsd: Number(formatBigNumber(tvlUsd.toString(), 6)),
      rewardTokens: [rewardToken],
      underlyingTokens: [rewardToken],
      url: 'https://app.blueshift.fi/#/staking'
    });
  }

  return res;
}

async function poolsApy(timestamp, block, chainBlocks) {
  const res = [];
  const transform = await transformMilkomedaAddress();

  const BLUES_PRICE = await getBluesPrice();

  const portfolios = (await sdk.api.abi.call({
    abi: abi.BlueshiftRegistry.getPortfolios,
    chain: 'milkomeda',
    target: REGISTRY_CONTRACT,
    params: [],
    // block: chainBlocks['milkomeda'],
  })).output;

  const rewardToken = (await sdk.api.abi.call({
    abi: abi.BlueshiftMinter.token,
    chain: 'milkomeda',
    target: MINTER_CONTRACT,
    params: [],
    // block: chainBlocks['milkomeda'],
  })).output;

  const aprWeights = (await sdk.api.abi.call({
    abi: abi.BlueshiftMinter.getAprWeights,
    chain: 'milkomeda',
    target: MINTER_CONTRACT,
    params: [],
    // block: chainBlocks['milkomeda'],
  })).output;

  (await farming(aprWeights, rewardToken, BLUES_PRICE, portfolios))
    .map(elem => res.push(elem));

  (await staking(aprWeights, rewardToken, BLUES_PRICE, portfolios))
    .map(elem => res.push(elem));

  return res;
}

module.exports = {
  timetravel: false,
  apy: poolsApy
};
