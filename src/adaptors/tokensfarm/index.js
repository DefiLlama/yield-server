const utils = require('../utils');
const FARM_URL = 'https://api.tokensfarm.com/farm/list?active=true&page=1&page_size=100&farm_type=LP,STAKE,STAKING';
const FARM_CONFIG_URL = (symbol, type, nonce) =>
  `https://api.tokensfarm.com/farm/config?symbol=${symbol}&type=${type}&nonce=${nonce}`

const apy = async () => {
  const data = await utils.getData(FARM_URL);
  const { farms } = data;
  const poolDetailCall = farms
    .map(pool => utils.getData(FARM_CONFIG_URL(pool.symbol, pool.type, pool.nonce)));
  const poolDetail = await Promise.all(poolDetailCall);
  return poolDetail.map(pool => {
    const { TokensFarm, RewardToken }  = pool.contracts;
    const { chainName } = pool.network;
    const [farmAssets] = pool.farmAssets;
    return {
      pool: `${TokensFarm}-${pool.type}-${chainName}`,
      chain: utils.formatChain(chainName),
      project: 'tokensfarm',
      symbol: farmAssets.assets.map(e => e.symbol).join('-'),
      poolMeta: pool.type,
      apy: pool.apy,
      underlyingTokens: farmAssets.assets.map(e => e.address),
      tvlUsd: pool.farmLiquidity,
      rewardTokens: [RewardToken]
    };
  });
};

module.exports = {
  timetravel: false,
  apy,
  url: 'https://tokensfarm.com/',
};
