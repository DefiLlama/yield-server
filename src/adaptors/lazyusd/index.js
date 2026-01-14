const sdk = require('@defillama/sdk');

const VAULT = '0xd53B68fB4eb907c3c1E348CD7d7bEDE34f763805';
const USDC = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';
const VAULT_DEPLOY_BLOCK = 24184528;

const apy = async () => {
  try {
    const latestBlock = (await sdk.api.util.getLatestBlock('ethereum')).number;
    const blocksPerDay = 7200;

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
    let historicalBlock = latestBlock - blocksPerDay * 7;
    let daysForCalc = 7;

    if (historicalBlock < VAULT_DEPLOY_BLOCK) {
      historicalBlock = latestBlock - blocksPerDay;
      daysForCalc = 1;
    }

    if (historicalBlock >= VAULT_DEPLOY_BLOCK) {
      try {
        const historicalRes = await sdk.api.abi.call({
          target: VAULT,
          abi: 'uint256:sharePrice',
          chain: 'ethereum',
          block: historicalBlock,
        });
        const historicalSharePrice = historicalRes.output / 1e6;
        const priceChange = (currentSharePrice - historicalSharePrice) / historicalSharePrice;
        apyBase = (priceChange / daysForCalc) * 365 * 100;
      } catch (e) {
        // Historical data unavailable, skip APY calculation
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
