const utils = require('../utils');

const LISTINGS_URL =
  process.env.AI_HEDGE_LISTINGS_URL ||
  'https://server-yield.aihedge.finance/api/v1/listings/vaults';

/**
 * Fetches and formats active AI Hedge ERC-4626 vault yield and TVL metrics.
 * @returns {Promise<Array<{pool: string, chain: string, project: string, symbol: string, tvlUsd: number, apyBase: number, apyBase7d?: number, underlyingTokens: string[], url: string}>>} Array of formatted pool objects for DeFiLlama
 */
async function apy() {
  const vaults = await utils.getData(LISTINGS_URL);

  return vaults
    .filter((v) => v.tvlUsd > 0)
    .map((v) => {
      const pool = {
        pool: `${v.vault}-${v.chain}`.toLowerCase(),
        chain: utils.formatChain(v.chain),
        project: 'ai-hedge',
        symbol: v.symbol,
        tvlUsd: v.tvlUsd,
        apyBase:
          typeof v.apyBase === 'number' && Number.isFinite(v.apyBase)
            ? v.apyBase
            : 0,
        underlyingTokens: [v.underlying.toLowerCase()],
        url: v.depositUrl,
      };

      if (typeof v.apy7d === 'number' && Number.isFinite(v.apy7d)) {
        pool.apyBase7d = v.apy7d;
      }

      return pool;
    });
}

module.exports = {
  protocolId: '8288',
  timetravel: false,
  apy,
  url: 'https://dapp.aihedge.finance/yield',
};
