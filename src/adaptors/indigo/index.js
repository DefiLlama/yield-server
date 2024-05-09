const { get, post } = require('./http-helper')

// Get Pool Data for each Stability Pool
async function apy() {
  const stabilityPools = await fetchStabilityPools();
  const adaPriceUsd = await fetchAdaPriceToUsd();

  return Promise.all(stabilityPools.map(async (pool) => {
    const adaRewardsKey = `sp_${pool.asset}_ada`;
    const indyRewardsKey = `sp_${pool.asset}_indy`;

    const [adaApy, indyApy] = await Promise.all([
      fetchApr(adaRewardsKey),
      fetchApr(indyRewardsKey)
    ]);

    const assetAnalytics = await fetchAssetAnalytics(pool.asset);
    const tvlUsd = await calculateTvlUsd(assetAnalytics, adaPriceUsd);

    return {
      pool: pool.asset,
      chain: "Cardano",
      project: "indigo",
      symbol: pool.asset,
      apyReward: (adaApy || 0) + (indyApy || 0),
      rewardTokens: ['ADA', 'INDY'],
      underlyingTokens: [pool.asset],
      tvlUsd: Number(tvlUsd),
    };
  }));
}

// fetch stability pools
async function fetchStabilityPools() {
  return await get(`https://analytics.indigoprotocol.io/api/stability-pools`);
}

// Fetch APR for each Stability Pool
async function fetchApr(key) {
  return await post(`https://analytics.indigoprotocol.io/api/apr/?key=${key}`)
    .then(res => {
      return parseFloat(res.value) || 0;
    })
    .catch((error) => {
      console.error(`Error fetching APR for ${key}:`, error);
      return 0;
    });
}

// Fetch iAsset analytics for a specific asset
async function fetchAssetAnalytics(assetName) {
  try {
    const response = await get(`https://analytics.indigoprotocol.io/api/assets/${assetName}/analytics`);
    return response[assetName];
  } catch (error) {
    console.error(`Error fetching analytics for ${assetName}:`, error);
    return null;
  }
}

// Fetch the ADA price in USD
async function fetchAdaPriceToUsd() {
  try {
    const response = await get('https://analytics.indigoprotocol.io/api/price?from=ADA&to=USD');
    return response.price;
  } catch (error) {
    console.error('Error fetching ADA price:', error);
    return 0;
  }
}

// Calculate TVL in USD
async function calculateTvlUsd(assetAnalytics, adaPriceUsd) {
  if (!assetAnalytics) return 0;

  return assetAnalytics.totalValueLocked * adaPriceUsd;
}

module.exports = {
  timetravel: false,
  apy: apy,
  url: 'https://app.indigoprotocol.io/stability-pools',
};

