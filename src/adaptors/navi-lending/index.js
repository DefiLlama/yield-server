const axios = require('axios');
const baseUrl = 'https://open-api.naviprotocol.io/api/poolsinfo';

const poolsFunction = async () => {
  const response = await axios.get(baseUrl);
  const data = response.data.pools;
  const arr = [];

  Object.keys(data).forEach((key) => {
    const pool = data[key];
    const supplyUsd = parseFloat(pool.total_supply) * parseFloat(pool.tokenPrice);
    const borrowUsd = parseFloat(pool.total_borrow) * parseFloat(pool.tokenPrice);
    arr.push({
      chain: 'Sui',
      project: 'navi-lending',
      pool: pool.pool,
      symbol: pool.symbol,
      tvlUsd: supplyUsd - borrowUsd,
      apyBase: parseFloat(pool.base_supply_rate),
      apyReward: pool.boosted_supply_rate ? parseFloat(pool.boosted_supply_rate) : null,
      rewardTokens: pool.rewardTokenAddress ? pool.rewardTokenAddress : [],
      totalSupplyUsd: supplyUsd,
      totalBorrowUsd: borrowUsd,
      apyBaseBorrow: parseFloat(pool.base_borrow_rate),
    });
  });

  return arr;
};

module.exports = {
  timetravel: false,
  apy: poolsFunction,
  url: 'https://app.naviprotocol.io/',
};

//poolsFunction().then(res => console.log(res));