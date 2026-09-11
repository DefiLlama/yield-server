const axios = require('axios');
const sdk = require('@defillama/sdk');
const providers = require('@defillama/sdk/build/providers.json');
const utils = require('../utils');

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

// TVL read on-chain (asset() + totalAssets(), priced via coins API), same as the
// ipor-fusion adapter in DefiLlama-Adapters. Returns tvlUsd keyed by vault address.
async function getTvlUsdByVault(chain, addresses) {
  const calls = addresses.map((target) => ({ target }));
  const [assets, totalAssets] = await Promise.all(
    ['address:asset', 'uint256:totalAssets'].map((abi) =>
      sdk.api.abi.multiCall({ chain, calls, abi, permitFailure: true })
    )
  );
  const coins = await utils.getPriceApiCoins(
    assets.output
      .filter(({ output }) => output)
      .map(({ output }) => `${chain}:${output.toLowerCase()}`)
  );

  return Object.fromEntries(
    addresses.map((address, i) => {
      const asset = assets.output[i].output;
      const coin = asset && coins[`${chain}:${asset.toLowerCase()}`];
      const balance = totalAssets.output[i].output;
      const tvlUsd =
        coin && balance
          ? (Number(balance) / 10 ** coin.decimals) * coin.price
          : 0;
      return [address.toLowerCase(), tvlUsd];
    })
  );
}

function buildPool(vault, tvlUsd) {
  const chain = CHAIN_BY_ID[vault.chainId];
  const apyReward = toNumber(vault.vestingApy);

  return {
    pool: vault.address,
    chain,
    project: 'fusion-by-ipor',
    symbol: vault.asset,
    tvlUsd,
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

  const vaults = data.vaults
    .filter((vault) => vault.chainId in CHAIN_BY_ID)
    // vaults not open for public deposits (whitelist only) are not listed;
    // a missing or null publicDepositOpened is treated as not public
    .filter((vault) => vault.publicDepositOpened === true)
    .filter((vault) => {
      const address = vault.address.toLowerCase();
      if (seen.has(address)) return false;
      seen.add(address);
      return true;
    });

  const tvlUsdByVault = {};
  for (const chain of new Set(
    vaults.map((vault) => CHAIN_BY_ID[vault.chainId])
  )) {
    const addresses = vaults
      .filter((vault) => CHAIN_BY_ID[vault.chainId] === chain)
      .map((vault) => vault.address);
    Object.assign(tvlUsdByVault, await getTvlUsdByVault(chain, addresses));
  }

  return vaults.map((vault) =>
    buildPool(vault, tvlUsdByVault[vault.address.toLowerCase()])
  );
};

module.exports = {
  protocolId: '5145',
  timetravel: false,
  apy,
};
