const axios = require('axios');
const utils = require('../utils');

const getApy = async () => {
  let pools = (
    await axios.get('https://api-sui.cetus.zone/v2/sui/swap/count')
  ).data.data.pools;
  let poolInfo = (
    await axios.get('https://api-sui.cetus.zone/v2/sui/pools_info')
  ).data.data.lp_list;
  let poolInfoObj = Object.fromEntries(poolInfo.map((item, key) => [item.address, item]))
  
  pools = pools.map((p) => {
      const rewarder_apr_1 = Number(p.rewarder_apr[0].replace('%',''))*100
      const rewarder_apr_2 = Number(p.rewarder_apr[1].replace('%',''))*100
      const rewarder_apr_3 = Number(p.rewarder_apr[2].replace('%',''))*100
      let apyReward =  rewarder_apr_1+rewarder_apr_2+rewarder_apr_3

      let rewarders = poolInfoObj[p.swap_account]?.object.rewarder_manager?.fields?.rewarders
      let rewardTokens = rewarders?.map(rewards=>{
        return rewards.fields.reward_coin.fields.name
      })
    return {
      pool: p.swap_account,
      chain: 'Sui',
      project: 'cetus',
      symbol: utils.formatSymbol(p.is_forward?`${p.token_a_reserves}-${p.token_b_reserves}`:`${p.token_b_reserves}-${p.token_a_reserves}`),
      underlyingTokens: [p.token_a_address, p.token_b_address],
      rewardTokens,
      tvlUsd: Number(p.tvl_in_usd),
      apyBase: Number(p?.apr_24h.replace('%',''))*100,
      apyBase7d: Number(p?.apr_7day.replace('%',''))*100,
      apyReward: apyReward > 0 ? apyReward : null,
      volumeUsd1d: p?.vol_in_usd_24h,
      volumeUsd7d: p?.vol_in_usd_7_day,
    };
  });
  return pools.filter((p) => utils.keepFinite(p))
};

module.exports = {
  apy: getApy,
  url: 'https://app.cetus.zone/pool/list',
};
