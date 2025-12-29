const utils = require('../utils');
const axios = require('axios');

const api = (chainId) =>
  `https://api.spectra.finance/v1/${chains[chainId].slug}/pools?source=defillama`;
const chains = {
  1: {
    name: 'ethereum',
    slug: 'mainnet',
    urlSlug: "eth",
    SPECTRA: '0x6a89228055c7c28430692e342f149f37462b478b',
  },
  42161: {
    name: 'arbitrum',
    slug: 'arbitrum',
    urlSlug: "arb",
    SPECTRA: '0x64fcc3a02eeeba05ef701b7eed066c6ebd5d4e51',
  },
  10: {
    name: 'optimism',
    slug: 'optimism',
    urlSlug: "op",
    SPECTRA: '0x248f43b622ce2f35a14db3fc528284730b619cd5',
  },
  8453: {
    name: 'base',
    slug: 'base',
    urlSlug: "base",
    SPECTRA: '0x64fcc3a02eeeba05ef701b7eed066c6ebd5d4e51',
  },
  146: {
    name: 'sonic',
    slug: 'sonic',
    urlSlug: "sonic",
    SPECTRA: '0xb827e91c5cd4d6aca2fc0cd93a07db61896af40b',
  },
  43111: {
    name: 'hemi',
    slug: 'hemi',
    urlSlug: "hemi",
    SPECTRA: '0x392fca63e58C1870fBeC04Eb6518A75703Dd2954',
  },
  43114: {
    name: 'avax',
    slug: 'avalanche',
    urlSlug: "avax",
    SPECTRA: '0x4baB31D6c557F8285eccB5167095147a36D9BaFa',
  },
  56: {
    name: 'bsc',
    slug: 'bsc',
    urlSlug: "bsc",
    SPECTRA: "0x4baB31D6c557F8285eccB5167095147a36D9BaFa"
  },
  999: {
    name: 'hyperliquid',
    slug: 'hyperevm',
    urlSlug: "hyperevm",
    SPECTRA: "0x6bd93ee39bcc7b9baba122c2ba65246e4347bbf9"
  },
  747474: {
    name: 'katana',
    slug: 'katana',
    urlSlug: "katana",
    SPECTRA: "0xb77f1a8cb126d8567f226f990f84e2f698cc30f8"
  },
  14: {
    name: 'flare',
    slug: 'flare',
    urlSlug: "flare",
    SPECTRA: "0x5390d7c6b8139ae9d255ed9e7ae6274e18032abe"
  },
  143: {
    name: 'monad',
    slug: 'monad',
    urlSlug: "monad",
    SPECTRA: "0x1c77c5b76f02ed1538d5af95a3b1f88e55178d2f"
  },
};

const poolId = (address, chainId) =>
  `${address}-${chains[chainId].slug}`.toLowerCase();

const spectraApy = (pool) => {
  if (pool.lpApy.details.rewards?.['SPECTRA']) {
    return pool.lpApy.details.rewards['SPECTRA'];
  } else if (pool.lpApy.details.boostedRewards?.['SPECTRA']) {
    return pool.lpApy.details.boostedRewards['SPECTRA'].min; // take lower APY bound
  } else {
    return 0;
  }
};

const formatMaturity = (maturity) =>
  new Date(maturity * 1000).toDateString('en-US'); // maturity is in seconds

const formatIbt = (ibt) =>
  `${ibt.symbol}${ibt.protocol ? ` (${ibt.protocol})` : ''}`;

const lpApy = (p) => {
  const spectra = spectraApy(p);
  const chain = chains[p.chainId];
  return {
    pool: poolId(p.address, p.chainId),
    chain: utils.formatChain(chain.name),
    project: 'spectra-v2',
    symbol: utils.formatSymbol(`${p.pt.ibt.symbol}`),
    tvlUsd: p.liquidity?.usd,
    apyBase: p.lpApy.total - spectra,
    apyReward: spectra,
    rewardTokens: spectra > 0 ? [chain.SPECTRA] : [],
    underlyingTokens: [p.pt.address, p.pt.ibt.address],
    poolMeta: `For LP on ${p.pt.ibt.protocol} | Maturity ${formatMaturity(
      p.pt.maturity
    )}`,
    url: `https://app.spectra.finance/pools/${chain.urlSlug}:${p.address}?ref=defillama`,
  };
};

const fixedRateApy = (p) => {
  const chain = chains[p.chainId];
  return {
    pool: poolId(p.pt.address, p.chainId),
    chain: utils.formatChain(chain.name),
    project: 'spectra-v2',
    symbol: utils.formatSymbol(`${p.pt.ibt.symbol}`),
    tvlUsd: p.liquidity?.usd,
    apyBase: p.pt.ibt.apr?.total,
    underlyingTokens: [p.pt.underlying.address],
    poolMeta: `For PT on ${p.pt.ibt.protocol}  | Maturity ${formatMaturity(
      p.pt.maturity
    )}`,
    url: `https://app.spectra.finance/fixed-rate/${chain.urlSlug}:${p.address}?ref=defillama`,
  };
};

async function apy() {
  const pts = await Promise.all(
    Object.keys(chains).map((chainId) =>
      axios
        .get(api(chainId), {
          headers: {
            'x-client-id': 'defillama',
          },
        })
        .then((res) => res.data.flat())
    )
  ).then((res) => res.flat());
  pts.forEach((pt) => {
    pt.pools.forEach((pool) => {
      pool.pt = pt; // inject PT reference into pool itself
    });
  });
  const pools = pts.flatMap((pt) => pt.pools);

  const apys = [...pools.map(lpApy), ...pools.map(fixedRateApy)]
    .flat()
    .filter((i) => utils.keepFinite(i)) // skip pools with no TVL (e.g. missing price)
    .sort((a, b) => b.tvlUsd - a.tvlUsd);

  return apys;
}

module.exports = {
  timetravel: false,
  apy,
};
