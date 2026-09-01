const getLendApy = require('./lend');
const getStrategyApy = require('./strategy');

const apy = async () => {
  const lendApyRes = await getLendApy();
  const strategyApyRes = await getStrategyApy();

  return [...lendApyRes, ...strategyApyRes];
};

module.exports = {
  protocolId: '3148',
  timetravel: false,
  apy: apy,
  url: 'https://app.stellaxyz.io',
};
