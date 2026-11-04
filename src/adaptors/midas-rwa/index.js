const { computeAPY } = require('./computeAPY');
const { contractAddresses } = require('./addresses');
const { fetchBaseAssetPrices } = require('./fetchBaseAssetPrices');
const { fetchTokenData } = require('./fetchTokenData');
const { formatUnits } = require('ethers/lib/utils');
const utils = require('../utils');

// Midas mTokens are yield-bearing RWA primitives: NAV accrues into the token,
// and they are widely posted as collateral elsewhere (Morpho Blue and Aave
// Horizon markets), where the venue pays nothing on collateral itself. Marking
// them as intrinsic sources lets those downstream pools surface the yield the
// depositor is still earning, as maple/usd-ai/spark-savings already do for
// their own yield-bearing primitives.
//
// Per the adapter guidelines, when the same product is deployed on several
// chains with the same intrinsic APY the flag belongs on the canonical
// deployment only. Ethereum is canonical where a pool actually resolved there;
// otherwise the largest pool for that product wins. Choosing among *emitted*
// pools rather than from the static config matters: a configured deployment
// can drop out on any given run (missing price data, a failed multicall), and
// pinning the flag to config alone would leave that product with no intrinsic
// source at all.
const markIntrinsicSources = (pools) => {
  const canonical = new Map();
  for (const pool of pools) {
    const product = pool.poolMeta;
    const incumbent = canonical.get(product);
    if (!incumbent) {
      canonical.set(product, pool);
      continue;
    }
    const isEth = (p) => p.chain === 'Ethereum';
    if (isEth(pool) && !isEth(incumbent)) canonical.set(product, pool);
    else if (isEth(pool) === isEth(incumbent) && pool.tvlUsd > incumbent.tvlUsd)
      canonical.set(product, pool);
  }
  for (const pool of canonical.values()) pool.isIntrinsicSource = true;
  return pools;
};

const poolsFunction = async () => {
  try {
    const baseAssetPrices = await fetchBaseAssetPrices();
    const data = await fetchTokenData(baseAssetPrices);
    const results = [];

    for (const [chain, tokens] of Object.entries(contractAddresses)) {
      for (const [token, tokenConfig] of Object.entries(tokens)) {
        const tokenData = data[chain]?.[token];

        if (!tokenData) {
          console.warn(`MidasRWA: Missing data for ${token} on ${chain}`);
          continue;
        }

        const apy = computeAPY(tokenData);

        const rawTvl =
          (tokenData.supply * tokenData.currentPrice) / BigInt(1e18);
        const tvlUsd = Number(formatUnits(rawTvl, 18));

        const result = {
          pool: `${tokenConfig.address.toLowerCase()}-${chain.toLowerCase()}`,
          chain: utils.formatChain(chain),
          project: 'midas-rwa',
          symbol: tokenConfig.denomination || 'USDC',
          poolMeta: token,
          tvlUsd,
          apyBase: apy,
          url: tokenConfig.url,
          underlyingTokens: [tokenConfig.address],
        };

        results.push(result);
      }
    }

    return markIntrinsicSources(results);
  } catch (error) {
    console.error('MidasRWA: Error in poolsFunction:', error);
    throw error;
  }
};

module.exports = {
  protocolId: '4873',
  timetravel: false,
  apy: poolsFunction,
  url: 'https://midas.app/',
};
