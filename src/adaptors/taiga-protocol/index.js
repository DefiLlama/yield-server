const utils = require('../utils');

const getPools = async () => {
  const taiKsmApr = await utils.getData(
    'https://api.taigaprotocol.io/rewards/apr?network=karura&pool=0'
  );
  const taiKsmStats = await utils.getData(
    'https://api.taigaprotocol.io/tokens/taiksm/stats'
  );
  const threeUsdApr = await utils.getData(
    'https://api.taigaprotocol.io/rewards/apr?network=karura&pool=1'
  );
  const threeUsdStats = await utils.getData(
    'https://api.taigaprotocol.io/tokens/3usd/stats'
  );

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

  const taiKsm = {
    pool: 'karura-sa0-taiga',
    chain: utils.formatChain('karura'),
    project: 'taiga-protocol',
    symbol: 'tKSM',
    tvlUsd: taiKsmStats.data.tvl,
    apyBase: taiKsmApr['sa://0'] * 100,
    apyReward: taiKsmApr['TAI'] * 100,
    rewardTokens: ['TAI'],
  };

  const threeUsd = {
    pool: 'karura-sa1-taiga',
    chain: utils.formatChain('karura'),
    project: 'taiga-protocol',
    symbol: '3USD',
    tvlUsd: threeUsdStats.data.tvl,
    apyBase: threeUsdApr['sa://1'] * 100,
    rewardTokens: ['TAI', 'sa://0', 'LKSM', 'KAR'],
    apyReward:
      (threeUsdApr['TAI'] +
        threeUsdApr['sa://0'] +
        threeUsdApr['LKSM'] +
        threeUsdApr['KAR']) *
      100,
  };

  const tdot = {
    pool: 'acala-sa0-taiga',
    chain: utils.formatChain('acala'),
    project: 'taiga-protocol',
    symbol: 'tDOT',
    tvlUsd: tdotStats.total * dotUsd,
    apyBase: Number(tdotApr['sa://0']) * 100,
  };

  return [taiKsm, threeUsd, tdot];
};

module.exports = {
  timetravel: false,
  apy: getPools,
  url: 'https://app.taigaprotocol.io/',
};
