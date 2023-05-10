const utils = require('../utils');

const poolsFunction = async () => {
  const apyData = await utils.getData(
    'https://api.filet.finance/pledge/pool/all?source=2'
  );
  const poolData = apyData.data.filter((item) => item.expireDays === 360)[0];

  const tvlData = await utils.getData(
    'https://api.filet.finance/pledge/ext/tx/pledgeTxAll'
  );

  const filPool = {
    pool: '0x01502CAE9E6f973EaB687aA99bA1b332AAa1837F-filecoin',
    chain: utils.formatChain('filecoin'),
    project: 'filet-finance',
    symbol: utils.formatSymbol('FIL'),
    tvlUsd: tvlData.data.tvl,
    apy: Number(poolData.incomeRate),
    poolMeta: 'Filecoin staking',
  };

  return [filPool];
};

module.exports = {
  timetravel: false,
  apy: poolsFunction,
  url: 'https://www.filet.finance',
};
