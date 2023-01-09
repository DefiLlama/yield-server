const { request } = require('graphql-request');
const utils = require('../utils');

const ChainId = {
  ETHEREUM: 1,
  POLYGON: 137,
  OPTIMISM: 10,
  ARBITRUM: 42161,
};

const ChainNameById = {
  [ChainId.ETHEREUM]: 'ethereum',
  [ChainId.POLYGON]: 'polygon',
  [ChainId.OPTIMISM]: 'optimism',
  [ChainId.ARBITRUM]: 'arbitrum',
};

/**  APIs url constants  */
const CLIPPER_POOL_API = 'https://clipper.exchange/api/apy';
/** */

const getData = async (chainId) => {
  const poolStatus = await utils.getData(
    `${CLIPPER_POOL_API}?chain=${chainId}`
  );
  return poolStatus;
};

const buildPoolInfo = (chainName, poolStatus, dailyPoolStatuses) => {
  const { value_in_usd, address } = poolStatus.pool;
  const assetSymbols = poolStatus.assets.map((asset) => asset.name).join('-');
  const formattedSymbol = utils.formatSymbol(assetSymbols);
  const apy = poolStatus.apy;

  return {
    pool: chainName === 'arbitrum' ? address.concat('-arbitrum') : address,
    chain: utils.formatChain(chainName),
    project: 'clipper',
    symbol: formattedSymbol,
    tvlUsd: value_in_usd,
    apy,
  };
};

const topLvl = async (chainId) => {
  const poolStatus = await getData(chainId);
  const chainName = ChainNameById[chainId];

  return buildPoolInfo(chainName, poolStatus);
};

const main = async () => {
  const data = await Promise.all([
    topLvl(ChainId.ETHEREUM),
    topLvl(ChainId.POLYGON),
    topLvl(ChainId.OPTIMISM),
    topLvl(ChainId.ARBITRUM),
  ]);

  return data;
};

module.exports = {
  timetravel: false,
  apy: main,
  url: 'https://clipper.exchange/app/liquidity/pool',
};
