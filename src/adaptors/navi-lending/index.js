const axios = require('axios');
const baseUrl = 'https://open-api.naviprotocol.io/api/poolsinfo';

const poolsFunction = async () => {
  const response = await axios.get(baseUrl);
  const data = response.data.pools;
  const arr = [];

  Object.keys(data).forEach((key) => {
    const pool = data[key];
    const price = parseFloat(pool.tokenPrice);
    const totalSupply = parseFloat(pool.total_supply);
    const totalBorrow = parseFloat(pool.total_borrow);
    const supplyUsd = totalSupply * price;
    const borrowUsd = totalBorrow * price;
    const availableBorrowUsd = Math.max(
      Math.min(totalSupply - totalBorrow, pool.borrow_cap_ceiling - totalBorrow),
      0
    ) * price;
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
      availableBorrowUsd,
      apyBaseBorrow: parseFloat(pool.base_borrow_rate),
      ...(pool.coin_type && { borrowToken: pool.coin_type }),
      ltv: parseFloat(pool.max_ltv),
      borrowable: availableBorrowUsd > 0,
      underlyingTokens: pool.coin_type ? [pool.coin_type] : undefined,
    });
  });

  return arr;
};

module.exports = {
  protocolId: '3323',
  timetravel: false,
  apy: poolsFunction,
  url: 'https://app.naviprotocol.io/',
};

//poolsFunction().then(res => console.log(res));