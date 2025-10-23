const axios = require('axios');
const { getPools } = require('../morfi/gql-requests');

const chains = {
  sui: 'https://api-sui.cetus.zone/v3/sui/clmm/stats_pools?is_vaults=false&display_all_pools=true&has_mining=true&has_farming=true&no_incentives=true&order_by=-tvl&limit=100&offset=0',
  aptos: 'https://api.cetus.zone/v2/swap/count',
};

const apy = async (chain) => {
  if (chain === 'sui') {
    let pools = (await axios.get(chains[chain])).data.data.list;

    return pools
      .map((p) => {
        const apyBase = Number(p?.stats[0].apr) * 100;
        const apyReward = p.totalApr * 100 - apyBase;

        let rewardTokens = p.miningRewarders?.map((rewards) => {
          return rewards.coinType;
        });
        return {
          pool: p.pool,
          chain: chain,
          project: 'cetus-clmm',
          symbol: [p.coinA.symbol, p.coinB.symbol].join('-'),
          underlyingTokens: [p.coinA.coinType, p.coinB.coinType],
          rewardTokens,
          tvlUsd: Number(p.tvl),
          apyBase: apyBase,
          apyReward: apyReward > 0 ? apyReward : 0,
          volumeUsd1d: Number(p?.stats[0].vol),
          poolMeta: `${Number(p.feeRate) / 100}%`,
          url: `https://app.cetus.zone/liquidity/deposit?poolAddress=${p.pool}`,
        };
      })
      .filter((i) => i.tvlUsd <= 1e8);
  }
  const data = (await axios.get(chains[chain])).data.data.pools;

  return data
    .map((p) => {
      const apyReward = p.rewarder_apr.reduce(
        (a, b) => a + Number(b.replace('%', '')),
        0
      );
      return {
        chain,
        project: 'cetus-clmm',
        pool: p.swap_account,
        symbol: p.symbol,
        tvlUsd: Number(p.tvl_in_usd),
        apyBase: Number(p.apr_24h.replace('%', '')),
        volumeUsd1d: Number(p.vol_in_usd_24h),
        apyReward,
        rewardTokens: apyReward > 0 ? ['sui', 'cetus'] : [],
        poolMeta: `${Number(p.fee) * 100}%`,
        underlyingTokens: [p.token_a_address, p.token_b_address],
        url: `https://app.cetus.zone/liquidity/deposit?poolAddress=${p.swap_account}`,
      };
    })
    .filter((i) => i.tvlUsd <= 1e8);
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
