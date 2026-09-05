const axios = require('axios');
const providers = require('@defillama/sdk/build/providers.json');

const FUSION_API_URL = 'https://api.ipor.io/v2/fusion/vaults';

const CHAINS = [
  'ethereum',
  'arbitrum',
  'base',
  'unichain',
  'flare',
  'ink',
  'plasma',
  'avax',
  'katana',
  'hyperliquid',
  'robinhood',
  'monad',
];
const CHAIN_BY_ID = Object.fromEntries(
  CHAINS.map((chain) => [providers[chain].chainId, chain])
);
// DefiLlama chain name -> app.ipor.io chain name (only where they differ)
const IPOR_CHAIN_NAME = {
  avax: 'avalanche',
  hyperliquid: 'hyperevm',
};

// API returns null (or omits) apy/tvl fields for some vaults; treat them as 0
const toNumber = (value) => Number(value ?? 0);

function buildPool(vault) {
  const chain = CHAIN_BY_ID[vault.chainId];
  const apyReward = toNumber(vault.vestingApy);

  return {
    pool: vault.address,
    chain,
    project: 'fusion-by-ipor',
    symbol: vault.asset,
    tvlUsd: toNumber(vault.tvl),
    apyBase:
      toNumber(vault.apy) +
      toNumber(vault.underlyingAssetApy) +
      toNumber(vault.rewardsApy),
    apyReward,
    underlyingTokens: [vault.assetAddress],
    ...(apyReward > 0 && { rewardTokens: [vault.assetAddress] }),
    poolMeta: vault.name,
    url: `https://app.ipor.io/fusion/${
      IPOR_CHAIN_NAME[chain] || chain
    }/${vault.address.toLowerCase()}`,
  };
}

const apy = async () => {
  const { data } = await axios.get(FUSION_API_URL);
  // API may list the same vault address more than once; keep the first entry
  const seen = new Set();

  return data.vaults
    .filter((vault) => vault.chainId in CHAIN_BY_ID)
    // vaults not open for public deposits (whitelist only) are not listed;
    // a missing or null publicDepositOpened is treated as not public
    .filter((vault) => vault.publicDepositOpened === true)
    .filter((vault) => {
      const address = vault.address.toLowerCase();
      if (seen.has(address)) return false;
      seen.add(address);
      return true;
    })
    .map(buildPool);
};

module.exports = {
  protocolId: '5145',
  timetravel: false,
  apy,
};
