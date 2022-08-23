const utils = require('../utils');

const getApiUrl = (chain) =>
  `https://app.dforce.network/general/markets?network=${chain}`;

const NETWORKS = {
  ethereum: 'mainnet',
  binance: 'bsc',
  polygon: 'Polygon',
  arbitrum: 'ArbitrumOne',
  optimism: 'Optimism',
};

const getApy = async () => {
  const markets = await Promise.all(
    Object.keys(NETWORKS).map(async (network) => {
      return {
        network,
        data: await utils.getData(getApiUrl(NETWORKS[network])),
      };
    })
  );

  const pools = markets
    .map(({ network, data: { supplyMarkets } }) => {
      return supplyMarkets.map((market) => ({
        pool: `${market.address}-${network}`,
        chain: utils.formatChain(network),
        project: 'dforce',
        symbol: market.underlying_symbol,
        tvlUsd:
          (Number(market.supplyValue) - Number(market.borrowValue)) / 1e18,
        // 1e16 = apy / 1e18 * 100%
        apy: (Number(market.rewardSupplyApy) + Number(market.supplyAPY)) / 1e16,
      }));
    })
    .flat();

  return pools;
};

module.exports = {
  timetravel: false,
  apy: getApy,
  url: 'https://app.dforce.network/#/lending?AssetsType=Lend&currentPool=general',
};
