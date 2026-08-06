const utils = require('../utils');

// Public, unauthenticated endpoint served by Neutral Trade's bundle indexer.
// Contract: { data: { vaults: [{ bundleKey, name, asset: { mint, symbol },
// tvlUsd, apy7dAfterFees, apy30dAfterFees, apyInceptionAfterFees }] } }
// with rates as decimal fractions net of performance + management fees.
const API_URL = 'https://api.neutral.trade/public/yields';

const toPct = (rate) => (Number.isFinite(rate) ? rate * 100 : null);

const getApy = async () => {
  const { data } = await utils.withRetry(() => utils.getData(API_URL));

  return data.vaults
    .filter((vault) => vault.asset?.mint && vault.asset?.symbol)
    .map((vault) => ({
      pool: vault.bundleKey,
      chain: utils.formatChain('solana'),
      project: 'neutral-trade',
      symbol: utils.formatSymbol(vault.asset.symbol),
      poolMeta: vault.name ?? undefined,
      underlyingTokens: [vault.asset.mint],
      // bundle shares are a virtual u128 on the vault account; no SPL share
      // mint exists
      token: null,
      // null when the indexer has no fresh USD price; dropped by keepFinite
      tvlUsd: vault.tvlUsd,
      // 7d NAV growth net of fees; longer windows cover young vaults
      apyBase: toPct(
        vault.apy7dAfterFees ??
          vault.apy30dAfterFees ??
          vault.apyInceptionAfterFees
      ),
      apyBase7d: toPct(vault.apy7dAfterFees),
    }))
    .filter(utils.keepFinite);
};

module.exports = {
  protocolId: '5548',
  timetravel: false,
  apy: getApy,
  url: 'https://www.neutral.trade/',
};
