const sdk = require('@defillama/sdk');

const VAULT = '0xd53B68fB4eb907c3c1E348CD7d7bEDE34f763805';
const USDC = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';
const VAULT_DEPLOY_BLOCK = 21763550;

const apy = async () => {
  const latestBlock = await sdk.api.util.getLatestBlock('ethereum');
  const blocksPerDay = 7200;

  const currentSharePrice = (
    await sdk.api.abi.call({
      target: VAULT,
      abi: 'function sharePrice() view returns (uint256)',
      chain: 'ethereum',
    })
  ).output / 1e6;

  const totalAssets = (
    await sdk.api.abi.call({
      target: VAULT,
      abi: 'function totalAssets() view returns (uint256)',
      chain: 'ethereum',
    })
  ).output / 1e6;

  // Calculate APY using available history (7-day preferred, 1-day fallback)
  let apyBase = 0;
  let historicalBlock = latestBlock.number - blocksPerDay * 7;
  let daysForCalc = 7;

  // Fall back to 1-day if vault is less than 7 days old
  if (historicalBlock < VAULT_DEPLOY_BLOCK) {
    historicalBlock = latestBlock.number - blocksPerDay;
    daysForCalc = 1;
  }

  if (historicalBlock >= VAULT_DEPLOY_BLOCK) {
    const historicalSharePrice = (
      await sdk.api.abi.call({
        target: VAULT,
        abi: 'function sharePrice() view returns (uint256)',
        chain: 'ethereum',
        block: historicalBlock,
      })
    ).output / 1e6;

    const priceChange = (currentSharePrice - historicalSharePrice) / historicalSharePrice;
    apyBase = (priceChange / daysForCalc) * 365 * 100;
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
