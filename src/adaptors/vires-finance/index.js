const utils = require('../utils');

const API_URL = 'https://api.vires.finance/state';
const API_URL_CONFIG = 'https://api.vires.finance/v2/config';

const configStateIDMapping = {
  '3PCwFXSq8vj8iKitA5zrrLRbuqehfmimpce':
    'DG2xFkPdDwKUoBkzGAhQtLpSGzfXLiCYPEzeKH2Ad24p', // usdn
  '3PEiD1zJWTMZNWSCyzhvBw9pxxAWeEwaghR':
    '34N9YcEETLWn93qYQ64EsP1x89tSruJU44RrEMSXXEPJ', // usdt
  '3PA7QMFyHMtHeP66SUQnwCgwKQHKpCyXWwd':
    '8LQW8f7P5d5PZM7GtZEBgaqRPGSzS3DfPuiXrURJ4AJS', // btc
  '3PPdeWwrzaxqgr6BuReoF3sWfxW8SYv743D':
    '474jTeYx2r2Va35794tCScAXWJG9hU2HcgxzMowaZUnu', // eth
  '3PGCkrHBxFMi7tz1xqnxgBpeNvn5E4M4g8S':
    '6XtHjpXbs9RRJP2Sr9GUyVqzACcby9TkThHXnjVC5CDJ', // usdc
  '3PBjqiMwwag72VWUtHNnVrxTBrNK8D7bVcN':
    'DUk2YTxhRoAqMJLus4G2b3fR8hMHVh6eiyFx5r29VR6t', // eurn
  '3PGzUA7Yp2RFobH9mPFYsZC1wkwWHNsP14q':
    '8zUYbdB8Q6mDhpcXYv52ji8ycfj4SDX4gJXS7YY3dA4R', // dai
  '3PNKc29PsUULxcHexjcZu7cMBqAAEYNfXnH':
    '8DLiYZjo3UUaRBTHU7Ayoqg4ihwb6YH1AfXrrhdjQ7K1', // busd
  '3P8G747fnB1DTQ4d5uD114vjAaeezCW4FaM': 'WAVES', // waves
};

const getApy = async () => {
  const { markets } = await utils.getData(API_URL);
  const { assets } = await utils.getData(API_URL_CONFIG);

  const pools = markets.map((item) => {
    return {
      pool: item.address,
      chain: utils.formatChain('waves'),
      project: 'vires-finance',
      symbol: item.name,
      tvlUsd: Number(item.totalSupplyUsd) - Number(item.totalDebtUsd),
      apyBase: Number(item.supplyApy) * 100,
      apyReward: Number(item.supplyViresApr) * 100,
      rewardTokens: ['DSbbhLsSTeDg5Lsiufk2Aneh3DjVqJuPr2M9uU1gwy5p'],
      // borrow fields
      totalSupplyUsd: Number(item.totalSupplyUsd),
      totalBorrowUsd: Number(item.totalDebtUsd),
      apyBaseBorrow: Number(item.borrowApr) * 100,
      apyRewardBorrow: Number(item.borrowViresApr) * 100,
      ltv: assets[configStateIDMapping[item.address]].collateralFactor / 1000,
    };
  });
  return pools;
};

module.exports = {
  timetravel: false,
  apy: getApy,
  url: 'https://vires.finance/',
};
