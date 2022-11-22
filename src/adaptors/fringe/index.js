const utils = require('../utils');

const poolsFunction = async () => {
  const apyData = await utils.getData(
    'https://api.fringe.fi/api/v1/market/totals'
  );

for (entry in apyData.data) {
  record = apyData.data[entry]
    if (record['kind'] == "lender_apy") {
        var lenderAPY = record["amount"]["rounded"]
    }
    if (record['kind'] == "total_supply") {
        var totalSupply = record["amount"]["rounded"]
    }
}

  const usdcPool = {
    pool: '0x9fD0928A09E8661945767E75576C912023bA384D',
    chain: 'Ethereum',
    project: 'fringe',
    symbol: 'USDC',
    tvlUsd: Number(totalSupply),
    apyBase: Number(lenderAPY),
    apy: Number(lenderAPY),
    underlyingTokens: ['0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48'],
    poolMeta: "V1 market"
  };

  return [usdcPool]; // Currently, Fringe only has a single pool with APY (until additional lending assets are deployed)
};

module.exports = {
  timetravel: false,
  apy: poolsFunction,
  url: 'https://app.fringe.fi/lend',
};


