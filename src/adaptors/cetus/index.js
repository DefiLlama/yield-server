const axios = require('axios');
const utils = require('../utils');

const getApy = async () => {
  let pools = (
    await axios.get('https://api-sui.cetus.zone/v2/sui/stats_pools?is_vaults=false&display_all_pools=true&has_mining=true&has_farming=true&no_incentives=true&order_by=-tvl&limit=100&offset=0')
  ).data.data.lp_list;
  
  pools = pools.map((p) => {

      const apyReward = p.rewarder_apr.reduce(
        (a, b) => a + Number(b.replace('%', '')),
        0
      );

      let rewarders = p.object.rewarder_manager?.fields?.rewarders
      let rewardTokens = rewarders?.map(rewards=>{
        return rewards.fields.reward_coin.fields.name
      })
    return {
      pool: p.address,
      chain: 'Sui',
      project: 'cetus',
      symbol: p.symbol,
      underlyingTokens: [p.coin_a_address, p.coin_b_address],
      rewardTokens,
      tvlUsd: Number(p.pure_tvl_in_usd),
      apyBase: Number(p?.apr.fee_apr_24h.replace('%','')),
      apyReward: apyReward > 0 ? apyReward : 0,
      volumeUsd1d: p?.vol_in_usd_24h,
      poolMeta: `${Number(p.fee) * 100}%`,
      url: `https://app.cetus.zone/liquidity/deposit?poolAddress=${p.swap_account}`,
    };
  });
  return pools.filter((p) => utils.keepFinite(p))
};

module.exports = {
  apy: getApy,
  url: 'https://app.cetus.zone/pool/list',
};
