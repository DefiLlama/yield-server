const axios = require('axios');
const { getPools } = require('../morfi/gql-requests');

const chains = {
  sui: 'https://api-sui.cetus.zone/v2/sui/stats_pools?is_vaults=false&display_all_pools=true&has_mining=true&has_farming=true&no_incentives=true&order_by=-tvl&limit=100&offset=0',
  aptos: 'https://api.cetus.zone/v2/swap/count',
};

const apy = async (chain) => {
  if (chain === 'sui') {
    let pools = (
        await axios.get(chains[chain])
      ).data.data.lp_list;
      
      return pools.map((p) => {
    
          const apyRewardSui = p.rewarder_apr.reduce(
            (a, b) => a + Number(b.replace('%', '')),
            0
          );
    
          let rewarders = p.object.rewarder_manager?.fields?.rewarders
          let rewardTokens = rewarders?.map(rewards=>{
            return rewards.fields.reward_coin.fields.name
          })
        return {
          pool: p.address,
          chain: chain,
          project: 'cetus-amm',
          symbol: p.symbol,
          underlyingTokens: [p.coin_a_address, p.coin_b_address],
          rewardTokens,
          tvlUsd: Number(p.pure_tvl_in_usd),
          apyBase: Number(p?.apr.fee_apr_24h.replace('%','')),
          apyReward: apyRewardSui > 0 ? apyRewardSui : 0,
          volumeUsd1d: Number(p?.vol_in_usd_24h),
          poolMeta: `${Number(p.fee) * 100}%`,
          url: `https://app.cetus.zone/liquidity/deposit?poolAddress=${p.swap_account}`,
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
        project: 'cetus-amm',
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
