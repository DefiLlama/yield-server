// adapters/nest-vaults.js
const sdk = require('@defillama/sdk');
const utils = require('../utils');

const DETAILS_URL = 'https://api.nest.credit/v1/vaults/details?live=true';
const POSITIONS_URL = 'https://api.nest.credit/v1/vaults';
const PLUME_CHAIN_ID = 98866;

// Nest shares bridge across chains at the same address, so each chain gets its own pool sized by
// that chain's supply. Nest API chain key -> [SDK chain, chain id, display name].
// ponytail: chains the SDK lacks (arc) are skipped; add them when the SDK supports them.
const CHAINS = {
  plume: ['plume_mainnet', PLUME_CHAIN_ID],
  mainnet: ['ethereum', 1],
  base: ['base', 8453],
  bsc: ['bsc', 56],
  plasma: ['plasma', 9745],
  arbitrum: ['arbitrum', 42161],
  monad: ['monad', 143],
  robinhood: ['robinhood', 4663],
  avalanche: ['avax', 43114, 'Avalanche'],
  worldchain: ['wc', 480, 'World Chain'],
};

const getPlumePusd = (vault) =>
  (vault.liquidAssets || [])
    .find(
      (asset) =>
        asset?.chainId === PLUME_CHAIN_ID &&
        asset?.symbol === 'pUSD' &&
        asset?.contractAddress
    )
    ?.contractAddress.toLowerCase();

const getUnderlyingTokens = async (slug) => {
  try {
    const res = await utils.getData(`${POSITIONS_URL}/${slug}/positions`);
    const yieldAssets = res?.data?.positions?.yieldAssets || [];
    const tokens = yieldAssets
      .flatMap((asset) => asset?.tokens || [])
      .filter(
        (token) =>
          token?.chainId === PLUME_CHAIN_ID &&
          token?.tokenAddress &&
          Number(token?.position?.value || 0) > 0
      )
      .map((token) => token.tokenAddress.toLowerCase());

    return [...new Set(tokens)];
  } catch {
    return [];
  }
};

// Deposit assets the vault's redemption contracts accept on a chain.
const getChainAssets = (vault, chainId) => [
  ...new Set(
    (vault.nestVaults || [])
      .flatMap((nv) => nv?.chainAssets || [])
      .filter((a) => a?.chainId === chainId && a?.assetAddress)
      .map((a) => a.assetAddress.toLowerCase())
  ),
];

const getSupply = async (chain, target) => {
  const [supply, decimals] = await Promise.all([
    sdk.api.erc20.totalSupply({ target, chain }),
    sdk.api.abi.call({ target, chain, abi: 'erc20:decimals' }),
  ]);
  return Number(supply.output) / 10 ** Number(decimals.output);
};

const vaultPools = async (v) => {
  const address = (v.vaultAddress || '').toLowerCase();
  if (!address) return [];

  // Calculate 7-day APY, fallback to 0 if empty
  const apy7dSrc = v?.apy?.rolling7d;
  let apyBase = 0; // Default to 0 if empty

  if (apy7dSrc !== undefined && apy7dSrc !== null && apy7dSrc !== '') {
    const apy7day = Number(apy7dSrc) * 100;
    if (Number.isFinite(apy7day)) {
      apyBase = apy7day;
    }
  }

  // Share price in USD from the hub accountant on Plume (base asset is a USD stablecoin).
  const rate = await sdk.api.abi.call({
    target: v.accountantAddress,
    chain: 'plume_mainnet',
    abi: 'uint256:getRate',
  });
  const price = Number(rate.output) / 10 ** Number(v.decimals);
  if (!Number.isFinite(price) || price <= 0) return [];

  const pusd = getPlumePusd(v);
  const plumeUnderlying = await getUnderlyingTokens(v.slug);
  if (!plumeUnderlying.length && pusd) {
    plumeUnderlying.push(pusd);
  }

  const base = {
    project: 'plume-vaults',
    symbol: v.symbol || 'NEST',
    apyBase,
    url: `https://app.plume.org/vaults/${v.slug}`,
  };

  const evmPools = await Promise.all(
    Object.keys(v.chain || {})
      .filter((key) => CHAINS[key])
      .map(async (key) => {
        const [chain, chainId, name] = CHAINS[key];
        const supply = await getSupply(chain, address);
        if (!(supply > 0)) return null;
        const isPlume = chain === 'plume_mainnet';
        const underlyingTokens = isPlume
          ? plumeUnderlying
          : getChainAssets(v, chainId);
        return {
          ...base,
          // Plume keeps the original id so its history carries over.
          pool: isPlume ? address : `${address}-${chain}`,
          chain: name || utils.formatChain(chain),
          tvlUsd: supply * price,
          ...(underlyingTokens.length && { underlyingTokens }),
        };
      })
  );

  const mint = v?.solana?.mintAddress;
  let solanaPool = null;
  if (mint) {
    const supply = Number(await utils.getTotalSupply(mint));
    if (supply > 0) {
      solanaPool = {
        ...base,
        pool: mint,
        chain: utils.formatChain('solana'),
        tvlUsd: supply * price,
      };
    }
  }

  return [...evmPools, solanaPool].filter(Boolean);
};

const poolsFunction = async () => {
  const res = await utils.getData(DETAILS_URL);
  const vaults = Array.isArray(res?.data) ? res.data : [];

  // One vault at a time: parallel reads across every vault overload the public Plume RPC.
  // Read errors propagate, so a failed run keeps the last good values instead of dropping pools.
  const pools = [];
  for (const v of vaults) pools.push(...(await vaultPools(v)));

  return pools.filter((p) => p.pool && p.chain && Number.isFinite(p.tvlUsd));
};

module.exports = {
  protocolId: '5284',
  timetravel: false,
  apy: poolsFunction,
  url: 'https://app.plume.org/vaults',
};
