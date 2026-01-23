const sdk = require('@defillama/sdk');

const VAULT = '0xd53B68fB4eb907c3c1E348CD7d7bEDE34f763805';
const USDC = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';
const VAULT_DEPLOY_BLOCK = 24184528;
const BLOCKS_PER_DAY = 7200;

// Calculate APY from share price change over N days
const calcApy = (currentPrice, historicalPrice, days) => {
  if (!historicalPrice || historicalPrice <= 0) return 0;
  const priceChange = (currentPrice - historicalPrice) / historicalPrice;
  const apy = (priceChange / days) * 365 * 100;
  // Cap at 100% APY to filter outliers, floor at 0
  if (apy > 100 || apy < 0) return 0;
  return apy;
};

const apy = async () => {
  try {
    const latestBlock = (await sdk.api.util.getLatestBlock('ethereum')).number;

    const [sharePriceRes, totalAssetsRes] = await Promise.all([
      sdk.api.abi.call({
        target: VAULT,
        abi: 'uint256:sharePrice',
        chain: 'ethereum',
      }),
      sdk.api.abi.call({
        target: VAULT,
        abi: 'uint256:totalAssets',
        chain: 'ethereum',
      }),
    ]);

    const currentSharePrice = sharePriceRes.output / 1e6;
    const totalAssets = totalAssetsRes.output / 1e6;

    let apyBase = 0;
    let apyBase7d = 0;

    const block1d = latestBlock - BLOCKS_PER_DAY;
    const block7d = latestBlock - BLOCKS_PER_DAY * 7;

    // Fetch historical share prices in parallel
    const historicalCalls = [];

    if (block1d >= VAULT_DEPLOY_BLOCK) {
      historicalCalls.push(
        sdk.api.abi.call({
          target: VAULT,
          abi: 'uint256:sharePrice',
          chain: 'ethereum',
          block: block1d,
        }).then(res => ({ days: 1, price: res.output / 1e6 }))
      );
    }

    if (block7d >= VAULT_DEPLOY_BLOCK) {
      historicalCalls.push(
        sdk.api.abi.call({
          target: VAULT,
          abi: 'uint256:sharePrice',
          chain: 'ethereum',
          block: block7d,
        }).then(res => ({ days: 7, price: res.output / 1e6 }))
      );
    }

    const historicalPrices = await Promise.all(historicalCalls);

    for (const { days, price } of historicalPrices) {
      const apy = calcApy(currentSharePrice, price, days);
      if (days === 1) apyBase = apy;
      if (days === 7) apyBase7d = apy;
    }

    // Use 7-day APY as primary metric (more stable than daily)
    // Fall back to daily APY if 7-day isn't available yet
    const primaryApy = apyBase7d > 0 ? apyBase7d : apyBase;

    const result = {
      pool: `${VAULT}-ethereum`.toLowerCase(),
      chain: 'Ethereum',
      project: 'lazy',
      symbol: 'USDC',
      tvlUsd: totalAssets,
      apyBase: primaryApy,
      underlyingTokens: [USDC],
      url: 'https://getlazy.xyz',
    };

    // Include 7-day APY for additional context
    if (apyBase7d > 0) {
      result.apyBase7d = apyBase7d;
    }

    return [result];
  } catch (error) {
    console.error('LazyUSD adapter error:', error.message);
    return [];
  }
};

module.exports = {
  timetravel: false,
  apy,
  url: 'https://getlazy.xyz',
};
