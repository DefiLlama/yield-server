const sdk = require('@defillama/sdk');
const fetch = require('node-fetch');
const utils = require('../utils');
const ABI = require('./abi');
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
      const tvlUsd = fromWei(
        pool.totalSupply,
        pool.stakingToken.decimals
      ).multipliedBy(
        pricesByAddress[pool.stakingToken.tokenAddress.toLowerCase()]
      );
      pools.push({
        pool: `${pool.target.toLowerCase()}-${pool.chain}`,
        chain: pool.chainName,
        project: 'unidex-perp',
        symbol: pool.stakingToken.symbol,
        tvlUsd: Number(tvlUsd.toFixed(2)),
        apyReward: Number(
          pool.rewardTokens
            .reduce(
              (rewardsInUSD, reward) =>
                rewardsInUSD.plus(
                  fromWei(
                    reward.rewardData.rewardRate,
                    reward.token.decimals
                  ).multipliedBy(
                    pricesByAddress[reward.token.tokenAddress.toLowerCase()]
                  )
                ),
              toBN(0)
            )
            .multipliedBy(60 * 60 * 24 * 365)
            .div(tvlUsd)
            .multipliedBy(100)
            .toFixed(2)
        ),
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
