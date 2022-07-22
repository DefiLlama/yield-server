const utils = require('../utils');

const getPools = async () => {
  const taiKsmApr = await utils.getData(
    'https://api.taigaprotocol.io/rewards/apr?network=karura&pool=0'
  );
  const taiKsmData = await utils.getData(
    'https://api.taigaprotocol.io/tokens/taiksm'
  );
  const ksmPrice = await utils.getData(
    'https://api.coingecko.com/api/v3/simple/price?ids=kusama&vs_currencies=usd&include_market_cap=true&include_24hr_vol=true&include_24hr_change=true'
  );
  const threeUsdApr = await utils.getData(
    'https://api.taigaprotocol.io/rewards/apr?network=karura&pool=1'
  );
  const threeUsdData = await utils.getData(
    'https://api.taigaprotocol.io/tokens/3usd'
  );

  const taiKsm = {
    pool: 'karura-sa0-taiga',
    chain: utils.formatChain('karura'),
    project: 'taiga-protocol',
    symbol: 'taiKSM',
    tvlUsd: Number(taiKsmData.tvl) * Number(ksmPrice.kusama.usd),
    apyBase: taiKsmApr['sa://0'] * 100,
    apyReward: taiKsmApr['TAI'] * 100,
  };

  const threeUsd = {
    pool: 'karura-sa1-taiga',
    chain: utils.formatChain('karura'),
    project: 'taiga-protocol',
    symbol: '3USD',
    tvlUsd: Number(threeUsdData.tvl),
    apyBase: threeUsdApr['sa://1'] * 100,
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
};
