const utils = require('../utils');

const API_URL = 'https://api.vires.finance/state';

const getApy = async () => {
  const { markets } = await utils.getData(API_URL);

  const pools = markets.map((item) => {
    return {
      pool: item.address,
      chain: utils.formatChain('waves'),
      project: 'vires-finance',
      symbol: item.name,
      tvlUsd: Number(item.supplyUsd) - Number(item.totalDebtUsd),
      apy: (Number(item.supplyApy) + Number(item.supplyViresApr)) * 100,
      apyReward: Number(item.supplyViresApr) * 100,
      apyFee: Number(item.supplyApy) * 100,
      rewardTokens: ['DSbbhLsSTeDg5Lsiufk2Aneh3DjVqJuPr2M9uU1gwy5p'],
    };
  });
  return pools;
};

module.exports = {
  timetravel: false,
  apy: getApy,
};
