const utils = require('../utils');

const getPools = async () => {
  const tdotApr = await utils.getData(
    'https://api.taigaprotocol.io/rewards/apr?network=acala&pool=0'
  );
  const tdotStats = await utils.getData(
    'https://api.taigaprotocol.io/tokens/tdot/stats'
  );

  const priceKey = 'coingecko:polkadot';

  const { coins: prices } = await utils.getData(
    `https://coins.llama.fi/prices/current/${priceKey}`
  );
  const dotUsd = prices[priceKey].price;

  const tdot = {
    pool: 'acala-sa0-taiga',
    chain: utils.formatChain('acala'),
    project: 'taiga-acala',
    symbol: 'tDOT',
    tvlUsd: tdotStats.total * dotUsd,
    apyBase: Number(tdotApr['sa://0']) * 100,
  };

  return [tdot];
};

module.exports = {
  timetravel: false,
  apy: getPools,
  url: 'https://app.taigaprotocol.io/',
};
