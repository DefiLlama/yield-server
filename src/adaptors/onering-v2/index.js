const sdk = require('@defillama/sdk');
const axios = require('axios');
const { ethers } = require('ethers');

function sumValuesWithDifferentDecimals(
  amount0,
  decimals0,
  amount1,
  decimals1
) {
  const amount0Formatted = ethers.utils.formatUnits(
    amount0.toString(),
    decimals0
  );
  const amount1Formatted = ethers.utils.formatUnits(
    amount1.toString(),
    decimals1
  );

  const value0Balance = ethers.utils.parseUnits(amount0Formatted, decimals0);
  const value1Balance = ethers.utils.parseUnits(amount1Formatted, decimals1);

  // Determine the maximum decimal places
  const maxDecimals = Math.max(decimals0, decimals1);

  // Adjust the balances to have the same decimal places
  const adjustedValue0Balance = value0Balance.mul(
    10 ** (maxDecimals - decimals0)
  );
  const adjustedValue1Balance = value1Balance.mul(
    10 ** (maxDecimals - decimals1)
  );

  // Sum the adjusted balances
  const total = adjustedValue0Balance.add(adjustedValue1Balance);

  // Format the total balance with the desired decimal places
  const totalFormatted = ethers.utils.formatUnits(total, maxDecimals);

  return Number(totalFormatted);
}

const getPools = async (pools) => {
  const poolsList = [];

  await Promise.all(
    pools.map(async (pool) => {
      const totalStaked = await sdk.api2.abi.call({
        abi: 'uint256:totalStaked',
        target: pool.address,
        chain: pool.chain,
      });
      const ts = Number(ethers.utils.formatEther(totalStaked));

      const rewardsPerSecond = await sdk.api2.abi.call({
        abi: 'uint256:REWARDS_PER_SECOND',
        target: pool.address,
        chain: pool.chain,
      });
      const rewardsPerDay =
        Number(ethers.utils.formatEther(rewardsPerSecond)) * 86400;

      const rewardsToken = await sdk.api2.abi.call({
        abi: 'address:REWARDS_TOKEN',
        target: pool.address,
        chain: pool.chain,
      });

      const lpToken = await sdk.api2.abi.call({
        abi: 'address:LP_TOKEN',
        target: pool.address,
        chain: pool.chain,
      });

      const lpToken0 = await sdk.api2.abi.call({
        abi: 'address:token0',
        target: lpToken,
        chain: pool.chain,
      });

      const lpToken1 = await sdk.api2.abi.call({
        abi: 'address:token1',
        target: lpToken,
        chain: pool.chain,
      });

      const lpTotalSupply = await sdk.api2.abi.call({
        abi: 'erc20:totalSupply',
        target: lpToken,
        chain: pool.chain,
      });

      const lpTs = Number(ethers.utils.formatEther(lpTotalSupply));

      const gauge = await sdk.api2.abi.call({
        abi: 'address:GAUGE',
        target: pool.address,
        chain: pool.chain,
      });

      const lpBalance = (
        await sdk.api.abi.call({
          abi: 'erc20:balanceOf',
          target: gauge,
          params: [pool.address],
          chain: pool.chain,
        })
      ).output;

      const lpBal = Number(ethers.utils.formatEther(lpBalance));

      const lpBalanceToken0 = (
        await sdk.api.abi.call({
          abi: 'erc20:balanceOf',
          target: lpToken0,
          params: [lpToken],
          chain: pool.chain,
        })
      ).output;

      const lpToken0Decimals = (
        await sdk.api.abi.call({
          abi: 'erc20:decimals',
          target: lpToken0,
          chain: pool.chain,
        })
      ).output;

      const lpBalanceToken1 = (
        await sdk.api.abi.call({
          abi: 'erc20:balanceOf',
          target: lpToken1,
          params: [lpToken],
          chain: pool.chain,
        })
      ).output;

      const lpToken1Decimals = (
        await sdk.api.abi.call({
          abi: 'erc20:decimals',
          target: lpToken1,
          chain: pool.chain,
        })
      ).output;

      const totalBalance = sumValuesWithDifferentDecimals(
        lpBalanceToken0,
        lpToken0Decimals,
        lpBalanceToken1,
        lpToken1Decimals
      );

      const rewardsTokenPrice = (
        await axios.get(
          `https://coins.llama.fi/prices/current/${pool.chain}:${rewardsToken}`
        )
      ).data;

      const rewardsTokenUsd =
        rewardsTokenPrice.coins[`${pool.chain}:${rewardsToken}`].price;

      const tvl = (ts / lpTs) * totalBalance;
      const apy =
        tvl === 0 ? 0 : ((rewardsPerDay * rewardsTokenUsd * 365) / tvl) * 100;

      poolsList.push({
        pool: pool.address,
        chain: pool.chain,
        symbol: pool.symbol,
        meta: pool.meta,
        tvl: tvl,
        apy: apy,
        rewardsToken: rewardsToken,
        underlyingToken: lpToken,
      });
    })
  );

  return poolsList;
};

const main = async () => {
  const poolsToReturn = [];
  const poolsList = [
    {
      address: '0x33ff52D1c4b6973CD5AF41ad53Dd92D99D31D3c3',
      chain: 'optimism',
      symbol: 'USDC/DOLA',
      meta: 'StableV2 AMM',
    },
  ];
  const pools = await getPools(poolsList);

  pools.map((pool) => {
    const poolValues = {
      pool: pool.pool,
      chain: pool.chain,
      project: 'onering-v2',
      symbol: pool.symbol,
      tvlUsd: pool.tvl,
      apyBase: pool.apy,
      rewardTokens: [pool.rewardsToken],
      underlyingTokens: [pool.underlyingToken],
      poolMeta: pool.meta,
    };
    poolsToReturn.push(poolValues);
  });

  return poolsToReturn;
};

module.exports = {
  timetravel: false,
  apy: main,
  url: 'https://onering.tools',
};
