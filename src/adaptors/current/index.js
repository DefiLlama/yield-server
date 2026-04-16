const axios = require('axios');

const marketTypes = [
  'MainMarket',
  'AltCoinMarket',
  'EmberMarket',
  'MatrixGoldMarket',
  'EthenaMarket',
];

const getMarketList = async (marketType) => {
  const url = `https://api.current.finance/market/getMarketList?marketType=${marketType}&page=1&size=100`;
  const { data } = await axios.get(url);
  return data.data.content;
};

const getRewards = async () => {
  const { data } = await axios.get(
    'https://api.current.finance/pebbleWeb3Config/getAllMarketConfig'
  );

  // Build lookup: marketID-token -> { supply: [{apr, rewardCoinType}], borrow: [...] }
  const rewards = {};
  for (const market of data.data) {
    for (const summary of market.summaries) {
      const key = `${market.marketID}-${summary.reserveCoinType}`;
      if (!rewards[key]) rewards[key] = { supply: [], borrow: [] };
      const side = summary.rewardType === 0 ? 'supply' : 'borrow';
      for (const r of summary.rewards) {
        rewards[key][side].push({
          apr: r.apr * 100,
          rewardCoinType: `0x${r.rewardCoinType}`,
        });
      }
    }
  }
  return rewards;
};

const poolsFunction = async () => {
  const [markets, rewards] = await Promise.all([
    Promise.all(marketTypes.map(getMarketList)),
    getRewards(),
  ]);
  const pools = markets.flat();

  return pools
    .filter((p) => p.totalSupply > 0)
    .map((pool) => {
      const decimals = Number(pool.tokenInfo.decimals);
      const price = parseFloat(pool.tokenInfo.price);
      const totalSupplyUsd = (pool.totalSupply / 10 ** decimals) * price;
      const totalBorrowUsd = (pool.totalBorrow / 10 ** decimals) * price;

      const key = `${pool.marketID}-${pool.token}`;
      const r = rewards[key];
      const apyReward = r
        ? r.supply.reduce((sum, x) => sum + x.apr, 0)
        : null;
      const apyRewardBorrow = r
        ? r.borrow.reduce((sum, x) => sum + x.apr, 0)
        : null;
      const rewardTokens = r
        ? [...new Set([...r.supply, ...r.borrow].map((x) => x.rewardCoinType))]
        : [];

      return {
        chain: 'Sui',
        project: 'current',
        pool: `${pool.marketID}-${pool.token}`,
        symbol: pool.tokenInfo.symbol,
        tvlUsd: totalSupplyUsd - totalBorrowUsd,
        apyBase: pool.supplyAPY * 100 + pool.apy,
        apyReward: apyReward || null,
        rewardTokens: rewardTokens.length ? rewardTokens : [],
        totalSupplyUsd,
        totalBorrowUsd,
        apyBaseBorrow: pool.borrowAPY * 100,
        apyRewardBorrow: apyRewardBorrow || null,
        underlyingTokens: [`0x${pool.token}`],
        poolMeta: pool.name,
        url: `https://app.current.finance/market/${pool.marketType}/${pool.token}`,
      };
    });
};

module.exports = {
  timetravel: false,
  apy: poolsFunction,
  url: 'https://app.current.finance/',
};
