import type Axios from 'axios';
const axios = require('axios') as typeof Axios;
import type Sdk from '@defillama/sdk';
const sdk = require('@defillama/sdk') as typeof Sdk;
import type Ethers from 'ethers';
const { utils: { formatUnits }, BigNumber } = require('ethers') as typeof Ethers;
import type Utils from '../utils';
const utils = require('../utils') as typeof Utils;
const MULTI_REWARDS_STAKING = require('./abis/MultiRewardsStaking.json');

const SECONDS_PER_YEAR = 31536000;

export type MultiRewardFarm = {
  stakingTokenPool?: string;
  pool: {
    pool?: string;
    project: string;
    symbol?: string;
    rewardTokens?: string[];
    underlyingTokens?: string[];
    poolMeta?: string;
    url?: string;
  };
};

export type MultiRewardFarms = {
  [chain: string]: {
    [address: string]: MultiRewardFarm
  };
}

async function getRewardTokens(chain: string, farms: MultiRewardFarms[string]): Promise<{ [farm: string]: string[] }> {
  const farmEntries = Object.entries(farms);

  const rewardTokens = farmEntries.map(([address, { pool }]) =>
    [address, pool.rewardTokens ?? []] as const
  );

  const rewardTokenLengthCalls = farmEntries.map(([target, { pool }], farmIndex) => {
    if (pool.rewardTokens !== undefined) {
      return undefined;
    }
    return { farmIndex, target };
  }).filter((x) => x !== undefined);

  const rewardTokenLengthResults = await sdk.api.abi.multiCall({
    abi: MULTI_REWARDS_STAKING.find(({ name }) => name === "getRewardTokenLength"),
    calls: rewardTokenLengthCalls.map(({ target }) => ({ target })),
    chain,
  }).then((call => call.output.map((x, callIndex) => ({
    ...rewardTokenLengthCalls[callIndex],
    rewardLength: x.output,
  }))));

  const rewardTokenCalls = rewardTokenLengthResults.flatMap((result) =>
    Array.from({ length: result.rewardLength }).map((_, rewardTokenIndex) => ({
      ...result,
      params: [rewardTokenIndex],
    }))
  );

  const rewardTokenResults = await sdk.api.abi.multiCall({
    abi: MULTI_REWARDS_STAKING.find(({ name }) => name === "rewardTokens"),
    calls: rewardTokenCalls.map(({ target, params }) => ({ target, params })),
    chain,
  }).then((call => call.output.map((x, callIndex) => ({
    ...rewardTokenCalls[callIndex],
    rewardToken: x.output,
  }))));

  for (const { farmIndex, rewardToken } of rewardTokenResults) {
    rewardTokens[farmIndex][1].push(rewardToken);
  }

  return Object.fromEntries(rewardTokens);
}

function getStakingTokens(chain: string, farms: MultiRewardFarms[string]): Promise<{ [farm: string]: string }> {
  const farmAddresses = Object.keys(farms);
  return sdk.api.abi.multiCall({
    abi: MULTI_REWARDS_STAKING.find(({ name }) => name === "stakingToken"),
    calls: farmAddresses.map((target) => ({ target })),
    chain,
  }).then((call => call.output.map((x, callIndex) =>
    [farmAddresses[callIndex], x.output]
  ))).then((results) => Object.fromEntries(results));
}

async function multiRewardFarmsApy(farms: MultiRewardFarms) {
  const pools = await Promise.all(Object.entries(farms).map(async ([chain, chainFarms]) => {
    const rewardTokensPromise = getRewardTokens(chain, chainFarms);
    const stakingTokensPromise = getStakingTokens(chain, chainFarms);
    const [stakingTokens, stakingTokensDecimals, rewardDataResults, totalSupplyResults, prices, symbols, yieldPools] = await Promise.all([
      stakingTokensPromise,
      stakingTokensPromise.then((stakingTokens) => sdk.api.abi.multiCall({
        abi: "erc20:decimals",
        calls: Array.from(new Set(Object.values(stakingTokens))).map((target) => ({ target })),
        chain,
      })).then((call) => call.output.map((x) => [x.input.target, x.output]))
        .then(Object.fromEntries),
      rewardTokensPromise.then((rewardTokens) =>
        sdk.api.abi.multiCall({
          abi: MULTI_REWARDS_STAKING.find(({ name }) => name === "rewardData"),
          calls: Object.entries(rewardTokens).flatMap(([target, farmRewardTokens]) =>
            farmRewardTokens.map((rewardToken) => ({ target, params: [rewardToken] }))
          ),
          chain,
        }).then((call => call.output))),
      sdk.api.abi.multiCall({
        abi: MULTI_REWARDS_STAKING.find(({ name }) => name === "totalSupply"),
        calls: Object.keys(chainFarms).map((target) => ({ target })),
        chain,
      }).then((call => call.output.map((x) => [x.input.target, x])))
        .then(Object.fromEntries),
      Promise.all([rewardTokensPromise, stakingTokensPromise]).then(([rewardTokens, stakingTokens]) =>
        utils.getPrices([
          ...Object.values(rewardTokens).flat(),
          ...Object.values(stakingTokens).flat(),
        ], chain)
      ),
      stakingTokensPromise.then((stakingTokens) => sdk.api.abi.multiCall({
        abi: "erc20:symbol",
        calls: Object.keys(chainFarms).map((farmAddress) => ({
          target: stakingTokens[farmAddress],
        })),
        chain,
      })).then((call => call.output.map((x) => [x.input.target, x])))
        .then(Object.fromEntries),
      axios.get('https://yields.llama.fi/pools').then((result) => result.data.data),
    ]);

    const tvlUsdChainFarms = Object.fromEntries(
      await Promise.all(
        Object.entries(chainFarms).map(async ([farmAddress, { stakingTokenPool, pool }]) => {
          const stakingTokenDecimals = stakingTokensDecimals[farmAddress];
          const totalSupply = Number(formatUnits(totalSupplyResults[farmAddress].output, stakingTokenDecimals));
          let stakingTokenPrice = prices.pricesByAddress[stakingTokens[farmAddress].toLowerCase()];

          // If the staking token price is not available, try to calculate it from the underlying tokens
          if (stakingTokenPrice === undefined) {
            const underlyingTokens = pool.underlyingTokens ?? yieldPools.find(({ pool }) => pool === stakingTokenPool)?.underlyingTokens;

            if (underlyingTokens === undefined) {
              return [farmAddress, undefined];
            }

            const [stakingTokenTotalSupply, underlyingTokenPrices, underlyingTokenBalances, underlyingTokenDecimals] = await Promise.all([
              sdk.api.abi.call({
                abi: "erc20:totalSupply",
                target: stakingTokens[farmAddress],
                chain,
              }).then((call) => call.output),
              utils.getPrices(underlyingTokens, chain),
              sdk.api.abi.multiCall({
                abi: "erc20:balanceOf",
                calls: underlyingTokens.map((underlyingToken) => ({ target: underlyingToken, params: [stakingTokens[farmAddress]] })),
                chain,
              }).then((call) => call.output.map((x) => x.output)),
              sdk.api.abi.multiCall({
                abi: "erc20:decimals",
                calls: underlyingTokens.map((underlyingToken) => ({ target: underlyingToken })),
                chain,
              }).then((call) => call.output.map((x) => x.output)),
            ]);

            let underlyingTokensTvlUsd = 0;
            for (const [index, underlyingToken] of underlyingTokens.entries()) {
              const underlyingTokenPrice = underlyingTokenPrices.pricesByAddress[underlyingToken.toLowerCase()];

              if (underlyingTokenPrice === undefined) {
                return [farmAddress, undefined];
              }

              const underlyingTokenBalance = Number(formatUnits(underlyingTokenBalances[index], underlyingTokenDecimals[index]));
              underlyingTokensTvlUsd += underlyingTokenBalance * underlyingTokenPrice;
            }
            stakingTokenPrice = underlyingTokensTvlUsd / Number(formatUnits(stakingTokenTotalSupply, stakingTokenDecimals));
          }

          const totalSupplyUsd = totalSupply * stakingTokenPrice;
          return [farmAddress, totalSupplyUsd];
        })
      )
    );

    const aprs: Record<string, Array<{ token: string, apr: number }>> = Object.fromEntries(
      Object.keys(chainFarms).map((address) => [address, []])
    );

    for (const { input: { target: farm, params: [rewardToken] }, output: { rewardRate, periodFinish } } of rewardDataResults) {
      if (periodFinish <= Math.floor(Date.now() / 1000)) {
        continue;
      }

      const rewardPrice = prices.pricesByAddress[rewardToken.toLowerCase()];
      if (rewardPrice === undefined) {
        continue;
      }

      const rewardsPerYearRaw = BigNumber.from(rewardRate).mul(SECONDS_PER_YEAR);
      if (rewardsPerYearRaw.eq(0)) {
        continue;
      }

      const rewardsPerYear = Number(formatUnits(rewardsPerYearRaw, 18));
      const rewardsPerYearUsd = rewardsPerYear * rewardPrice;
      const rewardApr = rewardsPerYearUsd / tvlUsdChainFarms[farm] * 100;

      aprs[farm].push({ token: rewardToken, apr: rewardApr });
    }

    return Object.entries(chainFarms).map(([farmAddress, { stakingTokenPool, pool }]) => {
      const tvlUsd = tvlUsdChainFarms[farmAddress];
      if (tvlUsd === undefined) {
        return undefined;
      }
      const stakingTokenYieldPool = yieldPools.find(({ pool }) => pool === stakingTokenPool);
      return {
        pool: `${farmAddress}-${chain}`,
        chain: utils.formatChain(chain),
        tvlUsd,
        symbol: utils.formatSymbol(symbols[stakingTokens[farmAddress]].output),
        apyBase: stakingTokenYieldPool?.apyBase ?? 0,
        apyReward: aprs[farmAddress].reduce((acc, { apr }) => acc + apr, 0),
        underlyingTokens: stakingTokenYieldPool?.underlyingTokens,
        ...pool,
        rewardTokens: aprs[farmAddress].map(({ token }) => token),
      }
    }).filter((x) => x !== undefined);
  }));
  return pools.flat();
}

export type MultiRewardFarmsApy = typeof multiRewardFarmsApy;

module.exports = {
  multiRewardFarmsApy
};
