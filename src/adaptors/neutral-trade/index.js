const utils = require('../utils');

const APP_URL = 'https://www.neutral.trade';
const YIELDS_API_URL = 'https://api.neutral.trade/public/yields';

const vaultMetadata = {
  '2bPiNfGc7exUcGkvV5nbsSkuNH3inFU18kgNEkB8fiaT': {
    snapshotVaultId: 71,
    strategySlug: 'hyperithm1',
  },
  '3vZKAcd74bzwNYZmsJndYExkGj6ABQwrUoiMtdNfzLZe': {
    snapshotVaultId: 80,
    strategySlug: 'options-mm-z',
  },
  '46gSEJLNTdDFq7DPjH8RbcTmG1gyw4JCKCr1XfuAfYvh': {
    snapshotVaultId: 75,
    strategySlug: 'adverseguard-alpha',
  },
  '4QBTzqUbn1crLg2PDUGt8abJfqHjeuZkjNLjCCit69ui': {
    snapshotVaultId: 74,
    strategySlug: 'volatility-alpha-strategy-1',
  },
  '9cMB2bMsLa9hZjRnjxFhg2DM9CLmjabMsGvfQUtdgupk': {
    snapshotVaultId: 65,
    strategySlug: 'jlpdn',
  },
  C68A4mAhA9EE4rWq9HmFnq3SPcbNmst6qiBWcna5VDHy: {
    snapshotVaultId: 82,
    strategySlug: 'hft-multi-factor',
  },
  De47QBuMP7xukYBek5r4ScZF4HEk1kHW34ymKASz3DLt: {
    snapshotVaultId: 78,
    strategySlug: 'velox-cross-usdc-bundle',
  },
  Ec6uSz5EsffwfXp43pvpz4rf9ttJRFKES4ZSVX7gVVkQ: {
    snapshotVaultId: 77,
    strategySlug: 'systematic-alpha',
  },
  Eo3m78EQcHnwMyHtxaiz1vw4nwHa85RuGE8jLsrELhxj: {
    snapshotVaultId: 72,
    strategySlug: 'cta-adaptive-alpha',
  },
  G5aMxQTbGWMnYycpfjHpD7Y1muoKBwaB1HtCdpUUcQZp: {
    snapshotVaultId: 83,
    strategySlug: 'cta-longshort-alpha',
  },
  nE1x7KQq2sm3GQrafQUUdBkSPPT52FmiMM9qAS1dgnC: {
    snapshotVaultId: 48,
    strategySlug: 'hlfundingarb',
  },
};

const toPct = (rate) => (Number.isFinite(rate) ? rate * 100 : null);

const getPricePerShare = async (snapshotVaultId) => {
  const { data } = await utils.withRetry(() =>
    utils.getData(
      `${APP_URL}/api/daily-vault-snapshot/${snapshotVaultId}?limit=1&sort=desc`
    )
  );
  const pricePerShare = data?.[0]?.pps_token_close;

  if (!Number.isFinite(pricePerShare) || pricePerShare <= 0) {
    throw new Error(`Invalid price per share for vault ${snapshotVaultId}`);
  }

  return pricePerShare;
};

const getApy = async () => {
  const { data } = await utils.withRetry(() => utils.getData(YIELDS_API_URL));
  const vaults = data.vaults.filter(
    (vault) =>
      vault.asset?.mint && vault.asset?.symbol && vaultMetadata[vault.bundleKey]
  );
  const pricesPerShare = await Promise.all(
    vaults.map((vault) =>
      getPricePerShare(vaultMetadata[vault.bundleKey].snapshotVaultId)
    )
  );

  return vaults
    .map((vault, index) => ({
      pool: vault.bundleKey,
      chain: utils.formatChain('solana'),
      project: 'neutral-trade',
      symbol: vault.asset.symbol,
      poolMeta: vault.name ?? undefined,
      underlyingTokens: [vault.asset.mint],
      token: null,
      tvlUsd: vault.tvlUsd,
      apyBase: toPct(vault.apy7dAfterFees),
      apyBase7d: toPct(vault.apy7dAfterFees),
      pricePerShare: pricesPerShare[index],
      url: `${APP_URL}/strategies/${vaultMetadata[vault.bundleKey].strategySlug}`,
    }))
    .filter(utils.keepFinite);
};

module.exports = {
  protocolId: '5548',
  timetravel: false,
  apy: getApy,
  url: 'https://www.neutral.trade/',
};
