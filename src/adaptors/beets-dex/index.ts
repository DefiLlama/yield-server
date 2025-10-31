const { getPools } = require('./utils');

const poolsFunction = async () => {
  const [sonicPoolsV2] = await Promise.all([getPools('SONIC', 'sonic', 2)]);

  return [...sonicPoolsV2];
};

module.exports = {
  timetravel: false,
  apy: poolsFunction,
  url: 'https://beets.fi/pools',
};
