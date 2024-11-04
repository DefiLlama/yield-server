const axios = require('axios');
const utils = require('../utils');
// const pfcore = 'https://api.pickle.finance/prod/protocol/pfcore/';
const pfcore =
  'https://f8wgg18t1h.execute-api.us-west-1.amazonaws.com/prod/protocol/pfcore';

async function apy() {
  const response = (await axios.get(pfcore))?.data.assets;
  const strategies = Object.values(response).flat(1);
  const current = strategies.filter(
    (s) =>
      s.enablement == 'enabled' &&
      s.details.harvestStats != undefined &&
      (s.aprStats ||
        s.farm?.details.farmApyComponents ||
        s.details.farmApyComponents)
  );

  return current.map((s) => ({
    pool: `${s.contract}-${s.id.toLowerCase().replace(/ /g, '')}`,
    chain: utils.formatChain(s.chain == 'eth' ? 'ethereum' : s.chain),
    project: 'pickle',
    symbol: utils.formatSymbol(
      s.depositToken.components
        ? s.depositToken.components.join('-').toUpperCase()
        : s.depositToken.name
    ),
    tvlUsd: s.details.harvestStats.balanceUSD ?? 0,
    apy: aggregateApys(s),
  }));
}
function aggregateApys(strategy) {
  let apy = 0;
  if (
    strategy.hasOwnProperty('aprStats') &&
    strategy.aprStats.apy != undefined
  ) {
    apy += strategy.aprStats.apy;
  }
  if (
    strategy.hasOwnProperty('farm') &&
    strategy.farm.details.farmApyComponents != undefined
  ) {
    apy += strategy.farm.details.farmApyComponents.reduce(
      (a, b) => Number(a) + Number(b.apr),
      0
    );
  }
  if (strategy.details.hasOwnProperty('farmApyComponents'))
    apy += strategy.details.farmApyComponents.reduce((a, b) => a + b.apr, 0);
  return apy;
}
const main = async () => {
  const data = await apy();
  return data;
};
module.exports = {
  timetravel: false,
  apy: main,
  url: 'https://app.pickle.finance/farms',
};
