const utils = require('../utils');
const axios = require('axios');

const api = (chainId) =>
  `https://app.spectra.finance/api/v1/${chains[chainId].slug}/pools?source=defillama`;
const chains = {
  1: {
    name: 'ethereum',
    slug: 'mainnet',
    APW: '0x4104b135dbc9609fc1a9490e61369036497660c8',
  },
  42161: {
    name: 'arbitrum',
    slug: 'arbitrum',
    APW: '0x3a67ca29ddf5ecf1844e811c43f27bd79f9ec310',
  },
  10: {
    name: 'optimism',
    slug: 'optimism',
    APW: '0x92a2a0d39da80e1fa21afdebdd87c4f975adf9f0',
  },
  8453: {
    name: 'base',
    slug: 'base',
    APW: '0x5dbe772a051fa853433cdae923c3b3ae955df7bd',
  },
};

const poolId = (address, chainId) =>
  `${address}-${chains[chainId].slug}`.toLowerCase();

const apwApy = (pool) => {
  if (pool.lpApy.details.rewards?.['APW']) {
    return pool.lpApy.details.rewards['APW'];
  } else if (pool.lpApy.details.boostedRewards?.['APW']) {
    return pool.lpApy.details.boostedRewards['APW'].min; // take lower APY bound
  } else {
    return 0;
  }
};

const formatMaturity = (maturity) =>
  new Date(maturity * 1000).toDateString('en-US'); // maturity is in seconds

const formatIbt = (ibt) =>
  `${ibt.symbol}${ibt.protocol ? ` (${ibt.protocol})` : ''}`;

const lpApy = (p) => {
  const apw = apwApy(p);
  const chain = chains[p.chainId];
  return {
    pool: poolId(p.address, p.chainId),
    chain: utils.formatChain(chain.name),
    project: 'spectra-v2',
    symbol: utils.formatSymbol(`LP-${formatIbt(p.pt.ibt)}`),
    tvlUsd: p.liquidity?.usd,
    apyBase: p.lpApy.total - apw,
    apyReward: apw,
    rewardTokens: apw > 0 ? [chain.APW] : [],
    underlyingTokens: [p.pt.address, p.pt.ibt.address],
    poolMeta: `For LP | Maturity ${formatMaturity(p.pt.maturity)}`,
    url: `https://app.spectra.finance/pools?ref=defillama#${chain.slug}/${p.address}`,
  };
};

const fixedRateApy = (p) => {
  const chain = chains[p.chainId];
  return {
    pool: poolId(p.pt.address, p.chainId),
    chain: utils.formatChain(chain.name),
    project: 'spectra-v2',
    symbol: utils.formatSymbol(`PT-${formatIbt(p.pt.ibt)}`),
    tvlUsd: p.liquidity?.usd,
    apyBase: p.impliedApy,
    underlyingTokens: [p.pt.underlying.address],
    poolMeta: `For PT | Maturity ${formatMaturity(p.pt.maturity)}`,
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
    .filter(({ tvlUsd }) => Number.isFinite(tvlUsd)) // skip pools with no TVL (e.g. missing price)
    .sort((a, b) => b.tvlUsd - a.tvlUsd);

  return apys;
}

module.exports = {
  timetravel: false,
  apy,
};
