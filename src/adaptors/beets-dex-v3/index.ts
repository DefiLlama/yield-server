const { getPools } = require('../beets-dex/utils');

const poolsFunction = async () => {
  const [sonicPoolsV3] = await Promise.all([getPools('SONIC', 'sonic', 3)]);

  return [...sonicPoolsV3];
};

module.exports = {
  timetravel: false,
  apy: poolsFunction,
  url: 'https://beets.fi/pools',
};
