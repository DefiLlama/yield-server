const sdk = require('@defillama/sdk');
const utils = require('../utils');
const { default: BigNumber } = require('bignumber.js');
const { parseUnits, formatUnits } = require('ethers/lib/utils');

const MASTERCHEF = '0x8a8fde5d57725f070bfc55cd022b924e1c36c8a0';

const gammaPools = [
  '0x52ee1FFBA696c5E9b0Bc177A9f8a3098420EA691',
  '0x6B7635b7d2E85188dB41C3c05B1efa87B143fcE8',
  '0xfA392dbefd2d5ec891eF5aEB87397A89843a8260',
  '0xF08BDBC590C59cb7B27A8D224E419ef058952b5f',
  '0x547a116a2622876ce1c8d19d41c683c8f7bec5c0',
  '0x95375694685E39997828Ed5B17f30f0A3eD90537',
  '0xa7fce463815f18dbe246152c5291b84db07c0bcd'
];

const unwrappedTokenData = async (tokenAddress, tokenAmount) => {
  try {
    const priceKey = `arbitrum:${tokenAddress}`;
    const { coins } = await utils.getData(
      `https://coins.llama.fi/prices/current/${priceKey}`
    );
    const tokenData = coins[priceKey];

    if (!tokenData) {
      console.log(`No price data found for token: ${priceKey}`);
      return [null, 0];
    }

    return [
      tokenData.symbol,
      formatUnits(tokenAmount, tokenData.decimals) * tokenData.price,
    ];
  } catch (error) {
    console.error(`Error fetching price for token ${tokenAddress}:`, error);
    return [null, 0];
  }
};

const getApy = async () => {
  const poolData = await utils.getData(
    'https://wire3.gamma.xyz/frontend/hypervisors/allDataSummary?chain=arbitrum&protocol=uniswapv3'
  );
  const rewardData = await utils.getData(
    'https://wire2.gamma.xyz/arbitrum/allRewards2'
  );

  return (
    await Promise.all(
      poolData
        .filter((result) =>
          gammaPools
            .map((pool) => pool.toLowerCase())
            .includes(result.address.toLowerCase())
        )
        .map(async (pool) => {
          try {
            const gammaPool = gammaPools.filter(
              (p) => p.toLowerCase() === pool.address
            )[0];
            const poolRewardData = rewardData[MASTERCHEF].pools[pool.address];
            let poolRewardTokens = [];
            if (pool.rewardsDetails) {
              poolRewardTokens = [
                ...poolRewardTokens,
                ...pool.rewardsDetails.map((reward) => reward.rewardToken),
              ];
            }

            const token0 = (
              await sdk.api.abi.call({
                target: pool.address,
                abi: 'address:token0',
                chain: 'arbitrum',
              })
            ).output;

            const token1 = (
              await sdk.api.abi.call({
                target: pool.address,
                abi: 'address:token1',
                chain: 'arbitrum',
              })
            ).output;

            const totalAmounts = (
              await sdk.api.abi.call({
                target: pool.address,
                abi: 'function getTotalAmounts() view returns (uint256 token0Bal, uint256 token1Bal)',
                chain: 'arbitrum',
              })
            ).output;

            const [token0Symbol, token0TVLUSD] = await unwrappedTokenData(
              token0,
              totalAmounts[0]
            );
            const [token1Symbol, token1TVLUSD] = await unwrappedTokenData(
              token1,
              totalAmounts[1]
            );

            if (!token0Symbol || !token1Symbol) {
              console.log(
                `Missing token symbol data for pool: ${pool.address}`
              );
              return null;
            }

            return {
              pool: `${pool.address}-arbitrum`,
              chain: 'Arbitrum',
              project: 'the-standard',
              symbol: `${token0Symbol}-${token1Symbol}`,
              tvlUsd: token0TVLUSD + token1TVLUSD,
              apyBase: parseFloat(pool.feeApr) * 100,
              apyReward: parseFloat(pool.rewardApr) * 100,
              rewardTokens: poolRewardTokens,
              underlyingTokens: [token0, token1],
            };
          } catch (error) {
            console.error(`Error processing pool ${pool.address}:`, error);
            return null;
          }
        })
    )
  ).filter(Boolean);
};

module.exports = {
  timetravel: false,
  apy: getApy,
  url: 'https://app.thestandard.io',
};
