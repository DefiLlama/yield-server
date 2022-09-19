const superagent = require('superagent');

const main = async () => {
  const key = 'ethereum:0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2';
  const ethPriceUSD = (
    await superagent.post('https://coins.llama.fi/prices').send({
      coins: [key],
    })
  ).body.coins[key].price;

  const data = (
    await superagent.get('https://api.compound.finance/api/v2/ctoken')
  ).body.cToken;

  const pools = [];
  // these are deprecated, dont want to include those
  // re WBTC: compound has a second WBTC token called WBTC2, which is active
  // and which we also include
  const exclude = ['cWBTC', 'cSAI', 'cREP'];
  for (const p of data) {
    if (exclude.includes(p.symbol)) continue;

    const apyReward = Number(p.comp_supply_apy.value);

    pools.push({
      pool: p.token_address,
      chain: 'Ethereum',
      project: 'compound',
      symbol: p.symbol === 'cWBTC2' ? 'cWBTC' : p.symbol,
      tvlUsd:
        (Number(p.cash.value) +
          Number(p.total_borrows.value) -
          Number(p.reserves.value)) *
        Number(p.underlying_price.value) *
        ethPriceUSD,
      apyBase: p.supply_rate.value * 100,
      apyReward,
      rewardTokens:
        apyReward > 0 ? ['0xc00e94cb662c3520282e6f5717214004a7f26888'] : [],
      underlyingTokens:
        p.underlying_address === null && p.underlying_name === 'Ether'
          ? ['0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2']
          : [p.underlying_address],
      // borrow fields
      apyBaseBorrow: p.borrow_rate.value * 100,
      apyRewardBorrow: Number(p.comp_borrow_apy.value),
      totalSupplyUsd:
        (Number(p.cash.value) +
          Number(p.total_borrows.value) -
          Number(p.reserves.value)) *
        Number(p.underlying_price.value) *
        ethPriceUSD,
      totalBorrowUsd:
        Number(p.total_borrows.value) *
        Number(p.underlying_price.value) *
        ethPriceUSD,
      ltv: Number(p.collateral_factor.value),
    });
  }

  return pools;
};

module.exports = {
  timetravel: false,
  apy: main,
  url: 'https://app.compound.finance/',
};
