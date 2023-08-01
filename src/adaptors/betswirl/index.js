const sdk = require('@defillama/sdk');
const utils = require('../utils');
const ABI = require('./abi');
const { default: BigNumber } = require('bignumber.js');

const stakingContracts = [
  {
    target: '0xeb5F6571861EAA6de9F827519B48eFe979d4d913',
    chain: 'bsc',
    chainId: 56,
    chainName: 'Binance',
  },
  {
    target: '0xa184468972c71209BC31a5eF39b7321d2A839225',
    chain: 'polygon',
    chainId: 137,
    chainName: 'Polygon',
  },
  {
    target: '0x31EDcD915e695AdAF782c482b9816613b347AC8c',
    chain: 'avax',
    chainId: 43114,
    chainName: 'Avalanche',
  },
  {
    target: '0xD4BFB259D8785228e5D2c19115D5DB342E2eE064',
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
    const { pricesBySymbol, pricesByAddress } = await utils.getPrices(
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
      ).multipliedBy(pricesBySymbol.bets);
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
        url: 'https://app.betswirl.com/staking?pool=BETS&c=' + pool.chainId,
      });
    }
    return pools;
  },
};
