const sdk = require('@defillama/sdk');
const utils = require('../utils');

const SECONDS_PER_YEAR = 31536000;
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';
const REWARDS_BY_ASSET_ABI =
  'function getRewardsByAsset(address) view returns (address[])';
const REWARDS_DATA_ABI =
  'function getRewardsData(address,address) view returns (uint256 index,uint256 emissionPerSecond,uint256 lastUpdateTimestamp,uint256 distributionEnd)';
const ASSET_INDEX_ABI =
  'function getAssetIndex(address,address) view returns (uint256 oldIndex,uint256 newIndex)';

const multiCall = async (chain, abi, calls) => {
  const results = calls.map(() => undefined);
  for (let attempt = 0; attempt < 2; attempt++) {
    const pending = calls.flatMap((call, i) =>
      results[i] === undefined ? [{ call, i }] : []
    );
    if (!pending.length) break;
    const { output } = await sdk.api.abi.multiCall({
      chain,
      abi,
      calls: pending.map(({ call }) => call),
      permitFailure: true,
    });
    output.forEach((o, j) => {
      if (o.success && o.output != null) results[pending[j].i] = o.output;
    });
  }
  const failed = results.filter((r) => r === undefined).length;
  if (failed) {
    console.error(
      `aave-v3 ${chain}: ${failed}/${calls.length} native reward reads failed (${abi.split('(')[0]})`
    );
  }
  return results;
};

const getNativeSupplyRewards = async ({ chain, reserves }) => {
  const rewardsByAToken = new Map();
  try {
    const now = Math.floor(Date.now() / 1000);
    const controllers = await multiCall(
      chain,
      'address:getIncentivesController',
      reserves.map((r) => ({ target: r.aToken }))
    );
    const incentivised = reserves.flatMap((reserve, i) =>
      controllers[i] && controllers[i] !== ZERO_ADDRESS
        ? [{ ...reserve, controller: controllers[i] }]
        : []
    );
    const rewardLists = await multiCall(
      chain,
      REWARDS_BY_ASSET_ABI,
      incentivised.map((r) => ({ target: r.controller, params: [r.aToken] }))
    );
    const streams = incentivised.flatMap((reserve, i) =>
      (rewardLists[i] || []).map((reward) => ({
        ...reserve,
        reward: reward.toLowerCase(),
      }))
    );
    const streamCalls = streams.map((s) => ({
      target: s.controller,
      params: [s.aToken, s.reward],
    }));
    const [streamData, assetIndexes] = await Promise.all([
      multiCall(chain, REWARDS_DATA_ABI, streamCalls),
      multiCall(chain, ASSET_INDEX_ABI, streamCalls),
    ]);
    const live = streams.flatMap((stream, i) => {
      const data = streamData[i];
      if (!data || !assetIndexes[i]) return [];
      const emissionPerSecond = Number(data.emissionPerSecond);
      const distributionEnd = Number(data.distributionEnd);
      const accruing = Number(assetIndexes[i].newIndex) > 0;
      return emissionPerSecond > 0 && distributionEnd > now && accruing
        ? [{ ...stream, emissionPerSecond }]
        : [];
    });
    if (!live.length) return rewardsByAToken;

    const rewardTokens = [...new Set(live.map((s) => s.reward))];
    const [decimals, prices] = await Promise.all([
      multiCall(
        chain,
        'erc20:decimals',
        rewardTokens.map((target) => ({ target }))
      ),
      utils.getPriceApiCoins(rewardTokens.map((t) => `${chain}:${t}`)),
    ]);
    const rewardDecimals = new Map(
      rewardTokens.map((t, i) => [t, decimals[i]])
    );
    const underlyingPriceByAToken = new Map(
      reserves.map((r) => [r.aToken.toLowerCase(), r.underlyingPrice])
    );

    for (const stream of live) {
      const price =
        prices[`${chain}:${stream.reward}`]?.price ??
        underlyingPriceByAToken.get(stream.reward);
      const decimals = rewardDecimals.get(stream.reward);
      if (
        !(price > 0) ||
        decimals === undefined ||
        !(stream.totalSupplyUsd > 0)
      ) {
        console.error(
          `aave-v3 ${chain}: cannot value native reward ${stream.reward} on ${stream.aToken}`
        );
        continue;
      }
      const rewardUsdPerYear =
        (stream.emissionPerSecond / 10 ** Number(decimals)) *
        SECONDS_PER_YEAR *
        price;
      const apr = (rewardUsdPerYear / stream.totalSupplyUsd) * 100;
      if (!Number.isFinite(apr)) continue;

      const key = stream.aToken.toLowerCase();
      const current = rewardsByAToken.get(key) || {
        apyReward: 0,
        rewardTokens: [],
      };
      current.apyReward += apr;
      current.rewardTokens.push(stream.reward);
      rewardsByAToken.set(key, current);
    }
  } catch (err) {
    console.error(
      `aave-v3 ${chain}: native supply rewards unavailable: ${err.message}`
    );
  }
  return rewardsByAToken;
};

const addNativeSupplyRewards = (pools, rewardsByPool) =>
  pools.map((pool) => {
    const native = rewardsByPool.get(pool.pool);
    if (!native) return pool;
    return {
      ...pool,
      apyReward: (pool.apyReward || 0) + native.apyReward,
      rewardTokens: [
        ...new Set(
          [...(pool.rewardTokens || []), ...native.rewardTokens].map((t) =>
            t.toLowerCase()
          )
        ),
      ],
    };
  });

module.exports = { getNativeSupplyRewards, addNativeSupplyRewards };
