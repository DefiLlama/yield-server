const axios = require('axios');
const sdk = require('@defillama/sdk');

const utils = require('../utils');
const poolAbi = require('./poolAbi');

const CHAIN = 'hyperliquid';
const PROTOCOL_DATA_PROVIDER = '0xa8Ca6a4A485485910aA4023b9963Dfd2f3A5aeb0';
const MERKL_CHAIN_ID = 999;

const getMerklRewards = async () => {
  try {
    const { data } = await axios.get(
      `https://api.merkl.xyz/v4/opportunities?name=purrlend&chainId=${MERKL_CHAIN_ID}&items=100`
    );
    const byIdentifier = {};
    for (const o of data) {
      if (o.status !== 'LIVE' || !o.apr) continue;
      const id = o.identifier.toLowerCase();
      const rewardTokens =
        o.rewardsRecord?.breakdowns
          ?.map((b) => b.token?.address)
          .filter(Boolean) ||
        o.tokens?.map((t) => t.address).filter(Boolean) ||
        [];
      byIdentifier[id] = {
        type: o.type,
        apr: o.apr,
        rewardTokens: [...new Set(rewardTokens.map((a) => a.toLowerCase()))],
      };
    }
    return byIdentifier;
  } catch (e) {
    return {};
  }
};

const apy = async () => {
  const reserveTokens = (
    await sdk.api.abi.call({
      target: PROTOCOL_DATA_PROVIDER,
      abi: poolAbi.find((m) => m.name === 'getAllReservesTokens'),
      chain: CHAIN,
    })
  ).output;

  const aTokens = (
    await sdk.api.abi.call({
      target: PROTOCOL_DATA_PROVIDER,
      abi: poolAbi.find((m) => m.name === 'getAllATokens'),
      chain: CHAIN,
    })
  ).output;

  const poolsReserveData = (
    await sdk.api.abi.multiCall({
      calls: reserveTokens.map((p) => ({
        target: PROTOCOL_DATA_PROVIDER,
        params: p.tokenAddress,
      })),
      abi: poolAbi.find((m) => m.name === 'getReserveData'),
      chain: CHAIN,
    })
  ).output.map((o) => o.output);

  const poolsReservesConfigurationData = (
    await sdk.api.abi.multiCall({
      calls: reserveTokens.map((p) => ({
        target: PROTOCOL_DATA_PROVIDER,
        params: p.tokenAddress,
      })),
      abi: poolAbi.find((m) => m.name === 'getReserveConfigurationData'),
      chain: CHAIN,
    })
  ).output.map((o) => o.output);

  const totalSupply = (
    await sdk.api.abi.multiCall({
      chain: CHAIN,
      abi: 'erc20:totalSupply',
      calls: aTokens.map((t) => ({ target: t.tokenAddress })),
    })
  ).output.map((o) => o.output);

  const underlyingBalances = (
    await sdk.api.abi.multiCall({
      chain: CHAIN,
      abi: 'erc20:balanceOf',
      calls: aTokens.map((t, i) => ({
        target: reserveTokens[i].tokenAddress,
        params: [t.tokenAddress],
      })),
    })
  ).output.map((o) => o.output);

  const underlyingDecimals = (
    await sdk.api.abi.multiCall({
      chain: CHAIN,
      abi: 'erc20:decimals',
      calls: aTokens.map((t) => ({ target: t.tokenAddress })),
    })
  ).output.map((o) => o.output);

  const priceKeys = reserveTokens
    .map((t) => `${CHAIN}:${t.tokenAddress}`)
    .join(',');
  const prices = (
    await axios.get(`https://coins.llama.fi/prices/current/${priceKeys}`)
  ).data.coins;

  const merklRewards = await getMerklRewards();

  return reserveTokens
    .map((pool, i) => {
      const frozen = poolsReservesConfigurationData[i].isFrozen;
      if (frozen) return null;

      const p = poolsReserveData[i];
      const price = prices[`${CHAIN}:${pool.tokenAddress}`]?.price;
      if (!price) return null;

      const supply = totalSupply[i];
      const totalSupplyUsd =
        (supply / 10 ** underlyingDecimals[i]) * price;

      const currentSupply = underlyingBalances[i];
      const tvlUsd = (currentSupply / 10 ** underlyingDecimals[i]) * price;
      const totalBorrowUsd = totalSupplyUsd - tvlUsd;

      const aTokenAddress = aTokens[i].tokenAddress.toLowerCase();
      const underlyingAddress = pool.tokenAddress.toLowerCase();

      const supplyReward = merklRewards[aTokenAddress];
      const borrowReward = merklRewards[underlyingAddress];

      const apyReward =
        supplyReward && supplyReward.type === 'AAVE_SUPPLY'
          ? supplyReward.apr
          : undefined;
      const apyRewardBorrow =
        borrowReward && borrowReward.type !== 'AAVE_SUPPLY'
          ? borrowReward.apr
          : undefined;

      const rewardTokens = [
        ...(supplyReward?.rewardTokens || []),
        ...(borrowReward?.rewardTokens || []),
      ];

      return {
        pool: `${aTokenAddress}-${CHAIN}`.toLowerCase(),
        chain: CHAIN,
        project: 'purrlend',
        symbol: pool.symbol,
        tvlUsd,
        apyBase: (p.liquidityRate / 10 ** 27) * 100,
        apyReward,
        underlyingTokens: [pool.tokenAddress],
        rewardTokens: rewardTokens.length ? [...new Set(rewardTokens)] : undefined,
        totalSupplyUsd,
        totalBorrowUsd,
        apyBaseBorrow: Number(p.variableBorrowRate) / 1e25,
        apyRewardBorrow,
        ltv: poolsReservesConfigurationData[i].ltv / 10000,
        url: `https://app.purrlend.io/reserve-overview/?underlyingAsset=${underlyingAddress}`,
        borrowable: poolsReservesConfigurationData[i].borrowingEnabled,
      };
    })
    .filter(Boolean)
    .filter((p) => utils.keepFinite(p));
};

module.exports = {
  apy,
};
