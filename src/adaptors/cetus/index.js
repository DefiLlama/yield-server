const axios = require('axios');

const chains = {
  sui: 'https://api-sui.cetus.zone/v2/sui/swap/count',
  aptos: 'https://api.cetus.zone/v2/swap/count',
};

const apy = async (chain) => {
  const data = (await axios.get(chains[chain])).data.data.pools;

  return data.map((p) => {
    const apyReward = p.rewarder_apr.reduce(
      (a, b) => a + Number(b.replace('%', '')),
      0
    );
    return {
      chain,
      project: 'cetus',
      pool: p.swap_account,
      symbol: p.symbol,
      tvlUsd: Number(p.tvl_in_usd),
      apyBase: Number(p.apr_24h.replace('%', '')),
      apyBase7d: Number(p.apr_7day.replace('%', '')),
      volumeUsd1d: Number(p.vol_in_usd_24h),
      volumeUsd7d: Number(p.vol_in_usd_7_day),
      apyReward,
      rewardTokens: apyReward > 0 ? ['sui', 'cetus'] : [],
      poolMeta: `${Number(p.fee) * 100}%`,
      underlyingTokens: [p.token_a_address, p.token_b_address],
      url: `https://app.cetus.zone/liquidity/deposit?poolAddress=${p.swap_account}`,
    };
  });
};

const main = async () => {
  const pools = await Promise.all(
    Object.keys(chains).map((chain) => apy(chain))
  );

  return pools.flat();
};

module.exports = {
  apy: main,
};
