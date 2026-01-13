const sdk = require('@defillama/sdk');

const VAULT = '0xd53B68fB4eb907c3c1E348CD7d7bEDE34f763805';
const USDC = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';

const apy = async () => {
  // Get current share price (6 decimals, like USDC)
  const currentSharePrice = (
    await sdk.api.abi.call({
      target: VAULT,
      abi: 'function sharePrice() view returns (uint256)',
      chain: 'ethereum',
    })
  ).output / 1e6;

  // Get total assets (TVL)
  const totalAssets = (
    await sdk.api.abi.call({
      target: VAULT,
      abi: 'function totalAssets() view returns (uint256)',
      chain: 'ethereum',
    })
  ).output / 1e6;

  // Get share price from 7 days ago using timetravel
  const blocksPerDay = 7200; // ~12 sec per block
  const block7DaysAgo = (await sdk.api.util.getLatestBlock('ethereum')).number - (blocksPerDay * 7);

  let apyBase;
  try {
    const historicalSharePrice = (
      await sdk.api.abi.call({
        target: VAULT,
        abi: 'function sharePrice() view returns (uint256)',
        chain: 'ethereum',
        block: block7DaysAgo,
      })
    ).output / 1e6;

    // Calculate 7-day APY
    const priceChange = (currentSharePrice - historicalSharePrice) / historicalSharePrice;
    apyBase = (priceChange / 7) * 365 * 100;
  } catch (e) {
    // Vault might not have existed 7 days ago, use accumulated yield instead
    const accumulatedYield = (
      await sdk.api.abi.call({
        target: VAULT,
        abi: 'function accumulatedYield() view returns (uint256)',
        chain: 'ethereum',
      })
    ).output / 1e6;

    const totalDeposited = (
      await sdk.api.abi.call({
        target: VAULT,
        abi: 'function totalDeposited() view returns (uint256)',
        chain: 'ethereum',
      })
    ).output / 1e6;

    // Estimate APY based on yield since launch (~6 days)
    const daysLive = 6;
    const yieldRate = accumulatedYield / totalDeposited;
    apyBase = (yieldRate / daysLive) * 365 * 100;
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
};

module.exports = {
  timetravel: false,
  apy,
  url: 'https://getlazy.xyz',
};
