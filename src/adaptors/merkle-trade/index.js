const { default: BigNumber } = require('bignumber.js');

const utils = require('../utils');
const MERKLE_RESOURCE_ACCOUNT =
  '0x5ae6789dd2fec1a9ec9cccfb3acaf12e93d432f0a3a42c92fe1a9d490b7bbc06';

async function main() {
  const gte = Date.now() - 30 * 86400 * 1000; // 30d
  const result = await utils.getData(
    `https://app.merkle.trade/api/v1/liquidity/stats?gte=${gte}`
  );
  const tvl = result.usdcBalance;
  const apr30d = result.apr;
  return [
    {
      pool: `${MERKLE_RESOURCE_ACCOUNT}-merkle-trade-mklp`,
      chain: utils.formatChain('aptos'),
      project: 'merkle-trade',
      symbol: utils.formatSymbol('zusdc'),
      tvlUsd: tvl,
      apyBase: apr30d,
    },
  ];
}

module.exports = {
  timetravel: false,
  apy: main,
  url: 'https://merkle.trade',
};
