const utils = require('../utils');

const poolsFunction = async () => {

  const data = await utils.getData(
    'https://api.polytrade.app/defi-llama/get/tvl/apy'
  );

  const { totalTVL, totalAPY } = data.data;

  const lenderPool = {
    pool: '0xE544a0Ca5F4a01f137AE5448027471D6a9eC9661-polygon',
    chain: 'Polygon',
    project: 'polytrade',
    symbol: 'USDC',
    tvlUsd: Number(totalTVL) / 1e6,
    apy: Number(totalAPY) * 100,
  };

  return [lenderPool];
};

module.exports = {
  timetravel: false,
  apy: poolsFunction,
  url: 'https://lender.polytrade.app',
};