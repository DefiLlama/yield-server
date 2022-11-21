const utils = require('../utils');

const url = 'https://backend-api-prod.frfi.io/autofarm?chainId=56&$limit=100';

const main = async () => {
  const response = await utils.getData(url);
  return response?.data?.map((item) => ({
    pool: `${item.vaultAddress}-${item.chainId}`.toLowerCase(),
    chain: 'binance',
    project: 'frfi',
    symbol: item.info?.mailInfo?.name ?? '',
    tvlUsd: item.tvl,
    apy: item.apy,
    poolMeta: '',
    url: `https://frfi.io/pool/${item._id}`,
  }));
};

module.exports = {
  timetravel: false,
  apy: main,
  url: 'https://frfi.io/pools',
};
