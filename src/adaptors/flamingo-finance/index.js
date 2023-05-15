const utils = require('../utils');

const poolsFunction = async () => {
  const poolsData = await utils.getData(
    'http://api.flamingo.finance/project-info/defillama-yields'
  );

  return poolsData.pools.reduce((acc, p) => {
    if (!acc.some((pool) => pool.pool === p.pool)) {
      acc.push(p);
    }
    return acc;
  }, []);
};

module.exports = {
  timetravel: false,
  apy: poolsFunction,
  url: 'https://flamingo.finance/earn/overview'
};