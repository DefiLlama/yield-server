const utils = require('../utils');

const MERKLE_RESOURCE_ACCOUNT =
  '0x5ae6789dd2fec1a9ec9cccfb3acaf12e93d432f0a3a42c92fe1a9d490b7bbc06';

async function main() {
  const result = await utils.getData(
    `https://api.prod.merkle.trade/v2/mklp/stats?p=30d`
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
      underlyingTokens: ['0xf22bede237a07e121b56d91a491eb7bcdfd1f5907926a9e58338f964a01b17fa::asset::USDC'],
    },
  ];
}

module.exports = {
  timetravel: false,
  apy: main,
  url: 'https://merkle.trade',
};
