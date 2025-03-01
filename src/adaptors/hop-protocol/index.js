const axios = require('axios');
const sdk = require('@defillama/sdk');
const { default: BigNumber } = require('bignumber.js');

const utils = require('../utils');

const api = 'https://assets.hop.exchange';

const getApy = async () => {
  const data = (await axios.get(`${api}/v1.1-pool-stats.json`)).data.data;

  const coreConfig = (await axios.get(`${api}/mainnet/v1-core-config.json`))
    .data.bridges;

  const tokens = Object.keys(data.pools);

  const pools = [];
  for (const token of tokens) {
    const tokenPools = data.pools[token];
    const chains = Object.keys(tokenPools).filter((c) => !['nova'].includes(c));

    for (chain of chains) {
      const config = coreConfig[token][chain];
      const poolAddress = config?.l2SaddleSwap;
      const tokenAddress = config?.l2CanonicalToken;
      const hopTokenAddress = config?.l2HopBridgeToken;
      if (!tokenAddress || !poolAddress) continue;

      const adaptedChain =
        chain === 'gnosis'
          ? 'xdai'
          : chain === 'polygonzk'
          ? 'polygon_zkevm'
          : chain;

      const tokenBalance = (
        await sdk.api.abi.call({
          abi: 'erc20:balanceOf',
          chain: adaptedChain,
          target: tokenAddress,
          params: [poolAddress],
        })
      ).output;

      const hopTokenBalance = (
        await sdk.api.abi.call({
          abi: 'erc20:balanceOf',
          chain: adaptedChain,
          target: hopTokenAddress,
          params: [poolAddress],
        })
      ).output;

      const decimals = (
        await sdk.api.abi.call({
          abi: 'erc20:decimals',
          chain: adaptedChain,
          target: tokenAddress,
        })
      ).output;

      const key = `${adaptedChain}:${tokenAddress}`;
      const price = (
        await axios.get(`https://coins.llama.fi/prices/current/${key}`)
      ).data.coins[key]?.price;

      const totalBalance = new BigNumber(tokenBalance)
        .plus(new BigNumber(hopTokenBalance))
        .div(new BigNumber(10 ** decimals));
      const tvlUsd = totalBalance.multipliedBy(price).toNumber();

      let optimalStakingRewardData;
      let stakingRewardAddresses = [];
      const stakingRewards = data.stakingRewards?.[token]?.[chain];
      if (stakingRewards) {
        const stakingRewardsContracts = Object.keys(stakingRewards);
        for (const stakingRewardsContract of stakingRewardsContracts) {
          const stakingRewardsContractData =
            stakingRewards[stakingRewardsContract];
          const isOptimal = stakingRewardsContractData.isOptimalStakingContract;
          if (isOptimal) {
            optimalStakingRewardData = stakingRewardsContractData;
          }
          stakingRewardAddresses.push(
            stakingRewardsContractData.rewardTokenAddress
          );
        }
      }
      const apyReward = optimalStakingRewardData
        ? optimalStakingRewardData.apy * 100
        : 0;

      pools.push({
        pool: `${chain}-${token}`,
        chain: utils.formatChain(adaptedChain),
        project: 'hop-protocol',
        symbol: token,
        apyBase: tokenPools[chain].apy * 100,
        apyReward,
        rewardTokens: apyReward > 0 ? stakingRewardAddresses : [],
        underlyingTokens: [tokenAddress, hopTokenAddress],
        tvlUsd,
        url: `https://app.hop.exchange/#/pool?token=${token}`,
      });
    }
  }

  return pools.filter((p) => utils.keepFinite(p));
};

module.exports = {
  timetravel: false,
  apy: getApy,
};
