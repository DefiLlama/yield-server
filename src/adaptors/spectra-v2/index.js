const utils = require('../utils');
const axios = require('axios');

const api = (chainId) =>
  `https://app.spectra.finance/api/v1/${chains[chainId].slug}/pools?source=defillama`;
const chains = {
  1: {
    name: 'ethereum',
    slug: 'mainnet',
    SPECTRA: '0x6a89228055c7c28430692e342f149f37462b478b',
  },
  42161: {
    name: 'arbitrum',
    slug: 'arbitrum',
    SPECTRA: '0x64fcc3a02eeeba05ef701b7eed066c6ebd5d4e51',
  },
  10: {
    name: 'optimism',
    slug: 'optimism',
    SPECTRA: '0x248f43b622ce2f35a14db3fc528284730b619cd5',
  },
  8453: {
    name: 'base',
    slug: 'base',
    SPECTRA: '0x64fcc3a02eeeba05ef701b7eed066c6ebd5d4e51',
  },
  146: {
    name: 'sonic',
    slug: 'sonic',
    SPECTRA: '0xb827e91c5cd4d6aca2fc0cd93a07db61896af40b',
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
    url: `https://app.spectra.finance/pools?ref=defillama#${chain.slug}/${p.address}`,
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
    apyBase: p.impliedApy,
    underlyingTokens: [p.pt.underlying.address],
    poolMeta: `For PT on ${p.pt.ibt.protocol}  | Maturity ${formatMaturity(
      p.pt.maturity
    )}`,
    url: `https://app.spectra.finance/fixed-rate?ref=defillama#${chain.slug}/${p.address}`,
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
