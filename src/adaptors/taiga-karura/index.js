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

  const taiKsm = {
    pool: 'karura-sa0-taiga',
    chain: utils.formatChain('karura'),
    project: 'taiga-karura',
    symbol: 'tKSM',
    tvlUsd: taiKsmStats.data.tvl,
    apyBase: taiKsmApr['sa://0'] * 100,
    apyReward: taiKsmApr['TAI'] * 100,
    rewardTokens: ['TAI'],
  };

  const threeUsd = {
    pool: 'karura-sa1-taiga',
    chain: utils.formatChain('karura'),
    project: 'taiga-karura',
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

  return [taiKsm, threeUsd];
};

module.exports = {
  timetravel: false,
  apy: getPools,
  url: 'https://app.taigaprotocol.io/',
};
