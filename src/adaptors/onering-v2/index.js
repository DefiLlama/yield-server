const utils = require('../utils');
const axios = require('axios');
const { ethers } = require('ethers');

const getOpPrice = async () => {
  const opUSDPrice = (
    await axios.get(
      `https://coins.llama.fi/prices/current/optimism:0x4200000000000000000000000000000000000042`
    )
  ).data;

  const opUsd =
    opUSDPrice.coins['optimism:0x4200000000000000000000000000000000000042']
      .price;

  return opUsd;
};

const getTvl = async () => {
  const tvlData = (await axios.get(`https://api.llama.fi/protocol/onering-v2`))
    .data;

  const { tvl } = tvlData;

  return tvl[tvl.length - 1].totalLiquidityUSD;
};

const getRewardsPerDay = async (farmContractAddress) => {
  const rewardsPerDay = (
    await axios.get(
      `https://evm.onering.tools/api/getRewardsPerDay?farmContractAddress=${farmContractAddress}`
    )
  ).data;

  return rewardsPerDay;
};

const main = async () => {
  const poolAddress = '0x33ff52D1c4b6973CD5AF41ad53Dd92D99D31D3c3';

  const opPrice = await getOpPrice();
  const tvl = await getTvl();
  const rewardsPerDayData = await getRewardsPerDay(poolAddress);
  const { rewardsPerDay } = rewardsPerDayData;
  const apy = tvl === 0 ? 0 : ((rewardsPerDay * opPrice * 365) / tvl) * 100;

  const pool = {
    pool: poolAddress,
    chain: 'optimism',
    project: 'onering-v2',
    symbol: 'StableV2 AMM - USDC/DOLA',
    tvlUsd: tvl,
    apyBase: apy,
    rewardTokens: ['0x4200000000000000000000000000000000000042'],
    underlyingTokens: ['0xB720FBC32d60BB6dcc955Be86b98D8fD3c4bA645'],
  };

  return [pool];
};

module.exports = {
  timetravel: false,
  apy: main,
  url: 'https://onering.tools',
};
