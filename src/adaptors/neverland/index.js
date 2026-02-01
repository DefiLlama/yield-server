const axios = require('axios');
const sdk = require('@defillama/sdk');

const utils = require('../utils');
const poolAbi = require('./poolAbi');
const {
  dustRewardsControllerAbi,
  dustLockAbi,
  revenueRewardAbi,
} = require('./abi');

const NEVERLAND_CHAIN = 'monad';

const protocolDataProvider = '0xfd0b6b6F736376F7B99ee989c749007c7757fDba';
const rewardsController = '0x57ea245cCbFAb074baBb9d01d1F0c60525E52cec';
const dustLock = '0xBB4738D05AD1b3Da57a4881baE62Ce9bb1eEeD6C';
const revenueReward = '0xff20ac10eb808B1e31F5CfCa58D80eDE2Ba71c43';

const calculateRewardApy = (
  rewardsData,
  rewardDecimals,
  prices,
  chain,
  baseUsd
) => {
  let totalApy = 0;
  for (const rewardData of rewardsData) {
    const emissionPerSecond = Number(rewardData.emissionPerSecond);
    const rewardTokenAddress = rewardData.rewardToken;
    const rewardPrice = prices[`${chain}:${rewardTokenAddress}`]?.price;
    const rewardDecimal = rewardDecimals[rewardTokenAddress];

    if (emissionPerSecond > 0 && rewardPrice && rewardDecimal && baseUsd > 0) {
      const emissionPerYear =
        (emissionPerSecond / 10 ** rewardDecimal) * 365.25 * 24 * 60 * 60;
      const emissionValueUsd = emissionPerYear * rewardPrice;
      totalApy += (emissionValueUsd / baseUsd) * 100;
    }
  }
  return totalApy;
};

const getApy = async () => {
  const chain = NEVERLAND_CHAIN;

  const reserveTokens = (
    await sdk.api.abi.call({
      target: protocolDataProvider,
      abi: poolAbi.find((m) => m.name === 'getAllReservesTokens'),
      chain,
    })
  ).output;

  const aTokens = (
    await sdk.api.abi.call({
      target: protocolDataProvider,
      abi: poolAbi.find((m) => m.name === 'getAllATokens'),
      chain,
    })
  ).output;

  const reserveTokensAddresses = (
    await sdk.api.abi.multiCall({
      calls: reserveTokens.map((p) => ({
        target: protocolDataProvider,
        params: p.tokenAddress,
      })),
      abi: poolAbi.find((m) => m.name === 'getReserveTokensAddresses'),
      chain,
    })
  ).output.map((o) => o.output);

  const poolsReserveData = (
    await sdk.api.abi.multiCall({
      calls: reserveTokens.map((p) => ({
        target: protocolDataProvider,
        params: p.tokenAddress,
      })),
      abi: poolAbi.find((m) => m.name === 'getReserveData'),
      chain,
    })
  ).output.map((o) => o.output);

  const poolsReservesConfigurationData = (
    await sdk.api.abi.multiCall({
      calls: reserveTokens.map((p) => ({
        target: protocolDataProvider,
        params: p.tokenAddress,
      })),
      abi: poolAbi.find((m) => m.name === 'getReserveConfigurationData'),
      chain,
    })
  ).output.map((o) => o.output);

  const totalSupply = (
    await sdk.api.abi.multiCall({
      chain,
      abi: 'erc20:totalSupply',
      calls: aTokens.map((t) => ({
        target: t.tokenAddress,
      })),
    })
  ).output.map((o) => o.output);

  const underlyingBalances = (
    await sdk.api.abi.multiCall({
      chain,
      abi: 'erc20:balanceOf',
      calls: aTokens.map((t, i) => ({
        target: reserveTokens[i].tokenAddress,
        params: [t.tokenAddress],
      })),
    })
  ).output.map((o) => o.output);

  const underlyingDecimals = (
    await sdk.api.abi.multiCall({
      chain,
      abi: 'erc20:decimals',
      calls: aTokens.map((t) => ({
        target: t.tokenAddress,
      })),
    })
  ).output.map((o) => o.output);

  const rewardsByAsset = (
    await sdk.api.abi.multiCall({
      chain,
      calls: aTokens.map((t) => ({
        target: rewardsController,
        params: [t.tokenAddress],
      })),
      abi: dustRewardsControllerAbi.find((m) => m.name === 'getRewardsByAsset'),
    })
  ).output.map((o) => o.output);

  const rewardsByDebtAsset = (
    await sdk.api.abi.multiCall({
      chain,
      calls: reserveTokensAddresses.map((t) => ({
        target: rewardsController,
        params: [t.variableDebtTokenAddress],
      })),
      abi: dustRewardsControllerAbi.find((m) => m.name === 'getRewardsByAsset'),
    })
  ).output.map((o) => o.output);

  const allRewardTokens = [
    ...new Set([...rewardsByAsset.flat(), ...rewardsByDebtAsset.flat()]),
  ];

  const rewardsDataCalls = [];
  for (let i = 0; i < aTokens.length; i++) {
    const rewards = rewardsByAsset[i] || [];
    for (const reward of rewards) {
      rewardsDataCalls.push({
        target: rewardsController,
        params: [aTokens[i].tokenAddress, reward],
        assetIndex: i,
        rewardToken: reward,
        isDebt: false,
      });
    }
  }

  for (let i = 0; i < reserveTokensAddresses.length; i++) {
    const rewards = rewardsByDebtAsset[i] || [];
    for (const reward of rewards) {
      rewardsDataCalls.push({
        target: rewardsController,
        params: [reserveTokensAddresses[i].variableDebtTokenAddress, reward],
        assetIndex: i,
        rewardToken: reward,
        isDebt: true,
      });
    }
  }

  const rewardsData =
    rewardsDataCalls.length > 0
      ? (
          await sdk.api.abi.multiCall({
            chain,
            calls: rewardsDataCalls.map((c) => ({
              target: c.target,
              params: c.params,
            })),
            abi: dustRewardsControllerAbi.find(
              (m) => m.name === 'getRewardsData' && m.inputs.length === 2
            ),
          })
        ).output.map((o, idx) => {
          const [
            index,
            emissionPerSecond,
            lastUpdateTimestamp,
            distributionEnd,
          ] = o.output;
          return {
            index,
            emissionPerSecond,
            lastUpdateTimestamp,
            distributionEnd,
            assetIndex: rewardsDataCalls[idx].assetIndex,
            rewardToken: rewardsDataCalls[idx].rewardToken,
            isDebt: rewardsDataCalls[idx].isDebt,
          };
        })
      : [];

  const rewardDecimals =
    allRewardTokens.length > 0
      ? (
          await sdk.api.abi.multiCall({
            chain,
            abi: 'erc20:decimals',
            calls: allRewardTokens.map((token) => ({
              target: token,
            })),
          })
        ).output.reduce((acc, o, idx) => {
          acc[allRewardTokens[idx]] = o.output;
          return acc;
        }, {})
      : {};

  const priceKeys = reserveTokens
    .map((t) => `${chain}:${t.tokenAddress}`)
    .concat(allRewardTokens.map((t) => `${chain}:${t}`))
    .join(',');
  const prices = (
    await axios.get(`https://coins.llama.fi/prices/current/${priceKeys}`)
  ).data.coins;

  return reserveTokens
    .map((pool, i) => {
      const config = poolsReservesConfigurationData[i];
      const frozen = config.isFrozen;
      if (frozen || !config.isActive) return null;

      const p = poolsReserveData[i];
      const price = prices[`${chain}:${pool.tokenAddress}`]?.price;

      if (!price) return null;

      const supply = totalSupply[i];
      const totalSupplyUsd = (supply / 10 ** underlyingDecimals[i]) * price;

      const currentSupply = underlyingBalances[i];
      const tvlUsd = (currentSupply / 10 ** underlyingDecimals[i]) * price;

      const totalBorrowUsd = totalSupplyUsd - tvlUsd;

      const apyBase = (p.liquidityRate / 10 ** 27) * 100;
      const apyBaseBorrow = Number(p.variableBorrowRate) / 1e25;

      const rewardsAddresses = rewardsByAsset[i] || [];

      const assetRewardsData = rewardsData.filter(
        (r) => r.assetIndex === i && !r.isDebt
      );
      const apyReward = calculateRewardApy(
        assetRewardsData,
        rewardDecimals,
        prices,
        chain,
        totalSupplyUsd
      );

      const debtRewardsData = rewardsData.filter(
        (r) => r.assetIndex === i && r.isDebt
      );
      const apyRewardBorrow = calculateRewardApy(
        debtRewardsData,
        rewardDecimals,
        prices,
        chain,
        totalBorrowUsd
      );

      const url = `https://app.neverland.money/markets?asset=${pool.symbol}`;

      return {
        pool: `${aTokens[i].tokenAddress}-${chain}`.toLowerCase(),
        chain: utils.formatChain(chain),
        project: 'neverland',
        symbol: pool.symbol,
        tvlUsd,
        apyBase,
        apyReward: assetRewardsData.length > 0 ? apyReward : null,
        rewardTokens: rewardsAddresses.length > 0 ? rewardsAddresses : null,
        underlyingTokens: [pool.tokenAddress],
        totalSupplyUsd,
        totalBorrowUsd,
        apyBaseBorrow,
        apyRewardBorrow: debtRewardsData.length > 0 ? apyRewardBorrow : null,
        ltv: config.ltv / 10000,
        url,
        borrowable: config.borrowingEnabled,
      };
    })
    .filter((p) => utils.keepFinite(p));
};

const getVeDustPool = async (chain, prices, rewardTokensList) => {
  try {
    const [dustSupply, dustToken, veDustSupply] = await Promise.all([
      sdk.api.abi.call({
        target: dustLock,
        abi: dustLockAbi.find((m) => m.name === 'supply'),
        chain,
      }),
      sdk.api.abi.call({
        target: dustLock,
        abi: dustLockAbi.find((m) => m.name === 'token'),
        chain,
      }),
      sdk.api.abi.call({
        target: dustLock,
        abi: dustLockAbi.find((m) => m.name === 'totalSupply'),
        chain,
      }),
    ]);

    const dustPrice = prices[`${chain}:${dustToken.output}`]?.price;
    if (!dustPrice || !dustSupply.output || dustSupply.output === '0')
      return null;

    const tvlUsd = (Number(dustSupply.output) / 1e18) * dustPrice;
    const veDustPowerUsd = (Number(veDustSupply.output) / 1e18) * dustPrice;

    if (!rewardTokensList || rewardTokensList.length === 0) return null;

    const WEEK = 7 * 24 * 60 * 60;
    const currentTime = Math.floor(Date.now() / 1000);
    const currentEpoch = Math.floor(currentTime / WEEK) * WEEK;
    const nextEpoch = currentEpoch + WEEK;

    const nextEpochRewardsCalls = rewardTokensList.map((token) => ({
      target: revenueReward,
      params: [token, nextEpoch],
    }));

    const [nextEpochRewardsData, rewardDecimalsData] = await Promise.all([
      sdk.api.abi.multiCall({
        chain,
        calls: nextEpochRewardsCalls,
        abi: revenueRewardAbi.find((m) => m.name === 'tokenRewardsPerEpoch'),
      }),
      sdk.api.abi.multiCall({
        chain,
        abi: 'erc20:decimals',
        calls: rewardTokensList.map((token) => ({ target: token })),
      }),
    ]);

    const totalApyReward = rewardTokensList.reduce((acc, token, i) => {
      const rewardPrice = prices[`${chain}:${token}`]?.price;
      const weeklyRewardsRaw = nextEpochRewardsData.output[i]?.output;
      const decimals = rewardDecimalsData.output[i]?.output;

      if (rewardPrice && weeklyRewardsRaw && decimals) {
        const weeklyRewards =
          Number(weeklyRewardsRaw) / Math.pow(10, Number(decimals));
        const annualRewardsUsd = weeklyRewards * rewardPrice * 52;
        return acc + (annualRewardsUsd / veDustPowerUsd) * 100;
      }
      return acc;
    }, 0);

    return {
      pool: `${dustLock}-${chain}`.toLowerCase(),
      chain: utils.formatChain(chain),
      project: 'neverland',
      symbol: 'veDUST',
      tvlUsd,
      apyReward: totalApyReward,
      rewardTokens: rewardTokensList,
      underlyingTokens: [dustToken.output],
      url: 'https://app.neverland.money',
    };
  } catch (error) {
    console.error('Error fetching veDUST pool:', error.message);
    return null;
  }
};

const apy = async () => {
  const chain = NEVERLAND_CHAIN;
  const [lendingPools, rewardTokensList] = await Promise.all([
    getApy(),
    sdk.api.abi.call({
      target: revenueReward,
      abi: revenueRewardAbi.find((m) => m.name === 'getRewardTokens'),
      chain,
    }),
  ]);

  const priceKeys = [
    ...lendingPools.flatMap((p) => p.underlyingTokens),
    ...lendingPools.flatMap((p) => p.rewardTokens || []),
    ...(rewardTokensList.output || []),
  ]
    .map((t) => `${chain}:${t}`)
    .join(',');

  const prices = (
    await axios.get(`https://coins.llama.fi/prices/current/${priceKeys}`)
  ).data.coins;

  const veDustPool = await getVeDustPool(
    chain,
    prices,
    rewardTokensList.output
  );

  return veDustPool ? [...lendingPools, veDustPool] : lendingPools;
};

module.exports = {
  apy,
  url: 'https://app.neverland.money',
};
