const sdk = require('@defillama/sdk');

const VAULT = '0xd53B68fB4eb907c3c1E348CD7d7bEDE34f763805';
const USDC = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';
const VAULT_DEPLOY_BLOCK = 24184528;
const BLOCKS_PER_DAY = 7200;

const apy = async () => {
  try {
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

    // 7-day rolling APY calculation
    let apyBase = 0;
    const latestBlock = (await sdk.api.util.getLatestBlock('ethereum')).number;
    const historicalBlock = latestBlock - BLOCKS_PER_DAY * 7;

    // Only calculate APY if vault has been live for 7+ days
    if (historicalBlock >= VAULT_DEPLOY_BLOCK) {
      const historicalRes = await sdk.api.abi.call({
        target: VAULT,
        abi: 'uint256:sharePrice',
        chain: 'ethereum',
        block: historicalBlock,
      });
      const historicalSharePrice = historicalRes.output / 1e6;

      if (historicalSharePrice > 0) {
        const priceChange = (currentSharePrice - historicalSharePrice) / historicalSharePrice;
        apyBase = (priceChange / 7) * 365 * 100;

        // Cap at 100% APY to filter outliers from data issues
        if (apyBase > 100) apyBase = 0;
        if (apyBase < 0) apyBase = 0;
      }
    }

    return [{
      pool: `${VAULT}-ethereum`.toLowerCase(),
      chain: 'Ethereum',
      project: 'lazyusd',
      symbol: 'USDC',
      tvlUsd: totalAssets,
      apyBase,
      underlyingTokens: [USDC],
      url: 'https://getlazy.xyz',
    }];
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
