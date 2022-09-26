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
    .map(({ network, data: { supplyMarkets, underlyingToken } }) => {
      return supplyMarkets.map((market) => ({
        pool: `${market.address}-${network}`,
        chain: utils.formatChain(network),
        project: 'dforce',
        symbol: market.underlying_symbol,
        tvlUsd:
          (Number(market.supplyValue) - Number(market.borrowValue)) / 1e18,
        // 1e16 = apy / 1e18 * 100%
        apyBase: Number(market.supplyAPY) / 1e16,
        apyReward: Number(market.rewardSupplyApy) / 1e16,
        rewardTokens: ['0x431ad2ff6a9c365805ebad47ee021148d6f7dbe0'],
        underlyingTokens: [
          underlyingToken.find((x) => x.symbol === market.underlying_symbol)
            .underlying,
        ],
        // borrow fields
        apyBaseBorrow: Number(market.borrowAPY) / 1e16,
        apyRewardBorrow: Number(market.rewardBorrowApy) / 1e16,
        totalSupplyUsd: Number(market.supplyValue) / 1e18,
        totalBorrowUsd: Number(market.borrowValue) / 1e18,
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
