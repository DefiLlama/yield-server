const utils = require('../utils');

const url = 'https://backend-api-prod.frfi.io/autofarm?$limit=1000';

const ChainMap = {
  56: 'bsc',
  137: 'polygon'
}

const main = async () => {
  const response = await utils.getData(url);
  return response?.data?.filter(item => !!ChainMap[item.chainId])?.map((item) => ({
    pool: `${item.vaultAddress}-${item.chainId}`.toLowerCase(),
    chain: utils.formatChain(ChainMap[item.chainId]),
    project: 'fairfi',
    symbol: item.info?.mailInfo?.name ?? '',
    tvlUsd: item.strategyTVL,
    apy: item.apy,
    url: `https://frfi.io/pool/${item._id}`,
  }));
};

module.exports = {
  timetravel: false,
  apy: main,
  url: 'https://frfi.io/pools',
};
