const utils = require('../utils');
const axios = require('axios');

const api = (chainId) =>
  `https://api.spectra.finance/v1/${chains[chainId].slug}/metavaults?source=defillama`;
const chains = {
  8453: {
    name: 'base',
    slug: 'base',
    urlSlug: 'base',
  },
  747474: {
    name: 'katana',
    slug: 'katana',
    urlSlug: 'katana',
  },
  14: {
    name: 'flare',
    slug: 'flare',
    urlSlug: 'flare',
  },
};

const mvId = (address, chainId) =>
  `${address}-${chains[chainId].slug}`.toLowerCase();

const rewardsApy = (mv) => {
  const details = mv.liveApy?.details || {};
  const rewards = Object.values(details.rewards || {});
  const mvRewards = Object.values(details.mvRewards || {});
  return [...rewards, ...mvRewards].reduce((sum, v) => sum + (v || 0), 0);
};

const mvApy = (mv) => {
  const chain = chains[mv.chainId];
  return {
    pool: mvId(mv.address, mv.chainId),
    chain: utils.formatChain(chain.name),
    project: 'spectra-metavaults',
    symbol: utils.formatSymbol(`${mv.metadata.title}`),
    tvlUsd: mv.tvl?.usd,
    apyBase: mv.liveApy?.details?.base,
    apyReward: rewardsApy(mv),
    rewardTokens: Object.values(mv.liveApy?.details?.rewardTokens || {}).map(
      (t) => t.address
    ),
    underlyingTokens: [mv.underlying.address],
    url: `https://app.spectra.finance/metavaults/${chain.urlSlug}:${mv.address}?ref=defillama`,
    token: mv.vault,
  };
};

async function apy() {
  const mvs = await Promise.all(
    Object.keys(chains).map((chainId) =>
      axios
        .get(api(chainId), {
          headers: {
            'x-client-id': 'defillama',
          },
          timeout: 10_000,
        })
        .then((res) => res.data.flat())
    )
  ).then((res) => res.flat());

  const apys = mvs
    .filter((mv) => mv.status === 'VISIBLE') // only include live MetaVaults
    .map(mvApy)
    .flat()
    .filter((i) => utils.keepFinite(i)) // skip MetaVaults with no TVL (e.g. missing price)
    .sort((a, b) => b.tvlUsd - a.tvlUsd);

  return apys;
}

module.exports = {
  timetravel: false,
  apy,
};
