const sdk = require('@defillama/sdk');
const fetch = require('node-fetch');
const utils = require('../utils');
const ABI = require('./abi');
const { default: BigNumber } = require('bignumber.js');

const stakingContracts = [
  {
    target: '0x20Df34eBe5dCB1082297A18BA8d387B55fB975a0',
    chain: 'bsc',
    chainId: 56,
    chainName: 'Binance',
  },
  {
    target: '0xA0D5F23dc9131597975afF96d293E5a7d0516665',
    chain: 'polygon',
    chainId: 137,
    chainName: 'Polygon',
  },
  {
    target: '0x9913EffA744B72385E537E092710072D21f8BC98',
    chain: 'avax',
    chainId: 43114,
    chainName: 'Avalanche',
  },
  {
    target: '0xA7Dd05a6CFC6e5238f04FD6E53D4eFa859B492e4',
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

    // Fetch the 8020 Balancer LPs receipt token price
    const balancer8020Stakings = poolsData.filter(
      (poolData) => poolData.is8020Staking
    );
    const prices = await Promise.all(
      balancer8020Stakings.map((balancer8020Staking) =>
        fetch(
          `https://api.betswirl.com/api/price?pool=${balancer8020Staking.stakingToken.tokenAddress.toLowerCase()}&chainId=${
            balancer8020Staking.chainId
          }`
        ).then((res) => res.json())
      )
    );
    balancer8020Stakings.forEach((balancer8020Staking, i) => {
      pricesByAddress[
        balancer8020Staking.stakingToken.tokenAddress.toLowerCase()
      ] = prices[i];
    });

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
        project: 'betswirl',
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
        url: `https://app.betswirl.com/staking?pool=${pool.target.toLowerCase()}&c=${
          pool.chainId
        }`,
      });
    }
    return pools;
  },
};
