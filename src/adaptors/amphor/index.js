const utils = require('../utils');

const poolsFunction = async () => {
  const aprData = await utils.getData(
    'https://app.amphor.io/api/apr?vaultSelected=USDC&networkId=1'
  );
  const apy = ((1 + Number(aprData.apr)/2600) ** (26) - 1) * 100;

  const usdcPool = {
    pool: '0x3b022EdECD65b63288704a6fa33A8B9185b5096b',
    chain: utils.formatChain('ETHEREUM'),
    project: 'amphor',
    symbol: utils.formatSymbol('USDC'),
    tvlUsd: 0,
    apy: apy,
  };

  return [usdcPool];
};

module.exports = {
  timetravel: false,
  apy: poolsFunction,
  url: 'https://app.amphor.io/earn',
};
