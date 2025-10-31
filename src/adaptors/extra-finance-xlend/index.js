const superagent = require('superagent');
const sdk = require('@defillama/sdk');

const utils = require('../utils');
const poolAbi = require('./poolAbi');

const protocolDataProviders = {
  optimism: '0xCC61E9470B5f0CE21a3F6255c73032B47AaeA9C0',
  base: '0x1566DA4640b6a0b32fF309b07b8df6Ade40fd98D',
};

function getRewardInfo(merklRewards, reserve) {
  let apyReward = 0;
  let apyRewardBorrow = 0;
  const rewardTokens = [];

  // get supply reward
  let targetRewardItem = merklRewards.find((rewardItem) => {
    return (
      rewardItem.action?.toLowerCase() === 'lend' &&
      rewardItem.identifier?.toLowerCase() ===
        reserve.aTokenAddress?.toLowerCase()
    );
  });
  // type = MULTILOG_DUTCH
  if (!targetRewardItem) {
    targetRewardItem = merklRewards.find((rewardItem) => {
      const tokensHasAtoken = rewardItem?.tokens?.find((tokenItem) => {
        return (
          tokenItem?.address?.toLowerCase() ===
          reserve.aTokenAddress?.toLowerCase()
        );
      });
      return (
        rewardItem.action?.toLowerCase() === 'lend' &&
        rewardItem.type === 'MULTILOG_DUTCH' &&
        !!tokensHasAtoken
      );
    });
  }
  if (targetRewardItem) {
    let incentiveAPR = String(targetRewardItem.apr / 100);
    if (targetRewardItem.type === 'MULTILOG_DUTCH') {
      if (
        targetRewardItem?.effective &&
        targetRewardItem?.effective?.userEffectiveUSD
      ) {
        incentiveAPR = String(
          (targetRewardItem?.dailyRewards * 365) /
            targetRewardItem?.effective?.userEffectiveUSD
        );
      }
    }
    apyReward = incentiveAPR * 100;
    const rewardTk =targetRewardItem.rewardsRecord?.breakdowns?.[0]?.token?.address.toLowerCase()
    if (!rewardTokens.includes(rewardTk)) {
      rewardTokens.push(rewardTk);
    }
  }

  // get borrow reward
  const targetBorrowRewardItem = merklRewards.find((rewardItem) => {
    return (
      rewardItem.action?.toLowerCase() === 'borrow' &&
      rewardItem.identifier?.toLowerCase() ===
        reserve.variableDebtTokenAddress?.toLowerCase()
    );
  });
  if (targetBorrowRewardItem) {
    apyRewardBorrow =
      ((targetBorrowRewardItem.rewardsRecord?.breakdowns?.[0]?.value * 365) /
        targetBorrowRewardItem?.tvlRecord?.total) *
        100 || 0;
    
    const rewardTk = targetBorrowRewardItem.rewardsRecord?.breakdowns?.[0]?.token?.address.toLowerCase()
    if (!rewardTokens.includes(rewardTk)) {
      rewardTokens.push(rewardTk);
    }
  }

  return {
    apyReward,
    apyRewardBorrow,
    rewardTokens,
  };
}

const getApy = async (market) => {
  const chain = market;

  const protocolDataProvider = protocolDataProviders[market];
  const reserveTokens = (
    await sdk.api.abi.call({
      target: protocolDataProvider,
      abi: poolAbi.find((m) => m.name === 'getAllReservesTokens'),
      chain,
    })
  ).output;

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

  const reserveTokenAddresses = (
    await sdk.api.abi.multiCall({
      calls: reserveTokens.map((p) => ({
        target: protocolDataProvider,
        params: p.tokenAddress,
      })),
      abi: poolAbi.find((m) => m.name === 'getReserveTokensAddresses'),
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
      calls: reserveTokenAddresses.map((t) => ({
        target: t.aTokenAddress,
      })),
    })
  ).output.map((o) => o.output);

  const underlyingBalances = (
    await sdk.api.abi.multiCall({
      chain,
      abi: 'erc20:balanceOf',
      calls: reserveTokenAddresses.map((t, i) => ({
        target: reserveTokens[i].tokenAddress,
        params: [t.aTokenAddress],
      })),
    })
  ).output.map((o) => o.output);

  const underlyingDecimals = (
    await sdk.api.abi.multiCall({
      chain,
      abi: 'erc20:decimals',
      calls: reserveTokenAddresses.map((t) => ({
        target: t.aTokenAddress,
      })),
    })
  ).output.map((o) => o.output);

  const priceKeys = reserveTokens
    .map((t) => `${chain}:${t.tokenAddress}`)
    .join(',');
  const prices = (
    await superagent.get(`https://coins.llama.fi/prices/current/${priceKeys}`)
  ).body.coins;

  let merklRewards = [];
  try {
    merklRewards = (
      await superagent.get(
        `https://api.merkl.xyz/v4/opportunities?mainProtocolId=xlend`
      )
    ).body.filter((i) => (i.status || '').toLowerCase() === 'live');
  } catch (err) {
    console.warn('get merkl rewards error');
  }

  return reserveTokens
    .map((pool, i) => {
      const frozen = poolsReservesConfigurationData[i].isFrozen;
      if (frozen) return null;

      const p = poolsReserveData[i];
      const price = prices[`${chain}:${pool.tokenAddress}`]?.price;

      const supply = totalSupply[i];
      let totalSupplyUsd = (supply / 10 ** underlyingDecimals[i]) * price;

      const currentSupply = underlyingBalances[i];
      let tvlUsd = (currentSupply / 10 ** underlyingDecimals[i]) * price;

      totalBorrowUsd = totalSupplyUsd - tvlUsd;

      const url = `https://xlend.extrafi.io/?underlyingAsset=${pool.tokenAddress.toLowerCase()}&marketName=${market}`;

      const { apyReward, apyRewardBorrow, rewardTokens } = getRewardInfo(
        merklRewards || [],
        reserveTokenAddresses[i]
      );

      return {
        pool: `${reserveTokenAddresses[i].aTokenAddress}-${market}-extrafi-xlend`.toLowerCase(),
        chain,
        project: 'extra-finance-xlend',
        symbol: pool.symbol,
        tvlUsd,
        apyBase: (p.liquidityRate / 10 ** 27) * 100,
        underlyingTokens: [pool.tokenAddress],
        totalSupplyUsd,
        totalBorrowUsd,
        debtCeilingUsd: null,
        apyBaseBorrow: Number(p.variableBorrowRate) / 1e25,
        apyReward,
        apyRewardBorrow,
        rewardTokens,
        ltv: poolsReservesConfigurationData[i].ltv / 10000,
        url,
        borrowable: poolsReservesConfigurationData[i].borrowingEnabled,
        mintedCoin: null,
        poolMeta: null,
      };
    })
    .filter((i) => Boolean(i));
};

const apy = async () => {
  const pools = await Promise.allSettled(
    Object.keys(protocolDataProviders).map(async (market) => getApy(market))
  );

  return pools
    .filter((i) => i.status === 'fulfilled')
    .map((i) => i.value)
    .flat()
    .filter((p) => utils.keepFinite(p));
};

module.exports = {
  apy,
};
