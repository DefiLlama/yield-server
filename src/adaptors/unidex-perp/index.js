const sdk = require('@defillama/sdk');
const fetch = require('node-fetch');
const utils = require('../utils');
const ABI = require('./abi.json');
const { default: BigNumber } = require('bignumber.js');

const stakingContracts = [
  {
    target: '0x35ad17c9ee4aab967ecbd95b4ce7eb9d8e761a2b',
    chain: 'arbitrum',
    chainId: 42161,
    chainName: 'Arbitrum',
  },
];
const getInfoABI = ABI.find(({ name }) => name === 'getInfo');

const ten = toBN('10');
function fromWei(wei, unit = 18) {
  return toBN(wei).dividedBy(ten.pow(unit));
}
function toBN(wei) {
  return new BigNumber(wei);
}

module.exports = {
  timetravel: false,
  apy: async () => {
    const pools = [];
    const poolsData = await Promise.all(
      stakingContracts.map(async (stakingContract) => {
        const {
          output: {
            __totalSupply: totalSupply,
            _stakingToken: stakingToken,
            _rewardTokens: rewardTokens,
          },
        } = await sdk.api.abi.call({
          ...stakingContract,
          abi: getInfoABI,
        });
        return {
          ...stakingContract,
          totalSupply,
          stakingToken,
          rewardTokens,
        };
      })
    );
    const { pricesByAddress } = await utils.getPrices(
      poolsData.reduce((addresses, poolData) => {
        addresses.push(
          `${poolData.chain}:${poolData.stakingToken.tokenAddress}`
        );
        addresses.push(
          ...poolData.rewardTokens.map(
            (rewardToken) =>
              `${poolData.chain}:${rewardToken.token.tokenAddress}`
          )
        );
        return addresses;
      }, [])
    );

    for (const pool of poolsData) {
      const stakingTokenPrice =
        pricesByAddress[pool.stakingToken.tokenAddress.toLowerCase()] || 0;
      const tvlUsd = fromWei(
        pool.totalSupply,
        pool.stakingToken.decimals
      ).multipliedBy(stakingTokenPrice);

      const tvlUsdNum = Number(tvlUsd.toFixed(2));

      // Calculate annual rewards in USD
      const annualRewardsUsd = pool.rewardTokens.reduce(
        (rewardsInUSD, reward) => {
          const rewardPrice =
            pricesByAddress[reward.token.tokenAddress.toLowerCase()] || 0;
          return rewardsInUSD.plus(
            fromWei(reward.rewardData.rewardRate, reward.token.decimals)
              .multipliedBy(rewardPrice)
              .multipliedBy(60 * 60 * 24 * 365)
          );
        },
        toBN(0)
      );

      // Calculate APY, avoiding division by zero
      const apyReward =
        tvlUsdNum > 0
          ? Number(annualRewardsUsd.div(tvlUsd).multipliedBy(100).toFixed(2))
          : 0;

      pools.push({
        pool: `${pool.target.toLowerCase()}-${pool.chain}`,
        chain: pool.chainName,
        project: 'unidex-perp',
        symbol: pool.stakingToken.symbol,
        tvlUsd: tvlUsdNum,
        apyReward,
        rewardTokens: pool.rewardTokens.map((rewardToken) =>
          rewardToken.token.tokenAddress.toLowerCase()
        ),
        underlyingTokens: [pool.stakingToken.tokenAddress.toLowerCase()],
        url: `https://leverage.unidex.exchange/staking`,
      });
    }
    return pools;
  },
};
