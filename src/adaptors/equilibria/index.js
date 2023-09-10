const utils = require('../utils');

const poolsFunction = async () => {
  const [
    chainInfoMap,
    chainList
  ] = await Promise.all([
    utils.getData('https://equilibria.fi/api/chain-info-map'),
    utils.getData('https://api.llama.fi/chains'),
]);
  const chainNameMap = Object.fromEntries(chainList.map(({chainId, name}) => [chainId, name]));

  return Object.entries(chainInfoMap || {}).flatMap(([chainId, chainInfo]) => {
    return chainInfo.poolInfos.map((poolInfo) => {
      const chain = utils.formatChain(chainNameMap[chainId] || chainId);
      const {rewardPool, marketInfo, tvl, apy} = poolInfo;

      return {
        pool: `${rewardPool}-${chain}`.toLowerCase(),
        chain,
        project: 'equilibria',
        symbol: utils.formatSymbol(marketInfo.farmProSymbol),
        poolMeta: marketInfo.protocol,
        tvlUsd: tvl,
        apy: apy * 100,
      };
    });
  });
};

module.exports = {
  timetravel: false,
  apy: poolsFunction,
  url: 'https://equilibria.fi/stake',
};
