const axios = require('axios').default;

const utils = require('../utils');

const API_URL = 'https://mainbackend.ratio.finance/lpairs';

interface Pool {
  address_id: string,
  symbol: string,
  tvlUsd: number;
  ratioAPR: number;
  baseAPR: number;
  assets: [{ mint: string, account: string}],
  status: string;
  platform_name: string;
}

type Pools = Array<Pool>;

const apy = async () => {
  const data: Pools = (await axios.get(API_URL)).data;
  const filteredData = data.filter(
    (pool) => { 
      return pool.status == 'true'
    });
  const pools = filteredData.map(
    (pool) => {
      let assets = pool.assets.map((assets) => {
        return assets.mint
      })
      let result: any = {
        pool: `${pool.address_id}-solana`.toLowerCase(),
        chain: utils.formatChain('solana'),
        project: 'ratio-finance',
        symbol: pool.symbol,
        tvlUsd: pool.tvlUsd,
        apyBase: pool.baseAPR,
        apyReward: pool.ratioAPR,
        underlyingTokens: assets,
        poolMeta: 'Platform: ' + pool.platform_name,
      };
      if (result.apyReward != 0) {
        result.rewardTokens = ['ratioMVg27rSZbSvBopUvsdrGUzeALUfFma61mpxc8J']
      }
      return result
    });

  return pools;
};

module.exports = {
  timetravel: false,
  apy: apy,
  url: 'https://app.ratio.finance/dashboard/available-vaults',
};
