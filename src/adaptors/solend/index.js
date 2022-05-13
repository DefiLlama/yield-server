const fetch = require('node-fetch');

const utils = require('../utils');

const baseUrl = 'https://api.solend.fi';
const configEndpoint = `${baseUrl}/v1/config`;
const reservesEndpoint = `${baseUrl}/v1/reserves`;

const buildPool = async (reserveConfig, reserveData) => {
  const liquidity = reserveData.reserve.liquidity;
  const apy = Number(reserveData.rates.supplyInterest) + reserveData.rewards.reduce((acc, reward) => reward.side === 'supply' ? Number(reward.apy) + acc : acc, 0)
  const secondaryString = reserveConfig.marketName.charAt(0).toUpperCase() + reserveConfig.marketName.slice(1) + ' Pool'

  const newObj = {
    pool: reserveConfig.address,
    chain: utils.formatChain('solana'),
    project: 'solend',
    symbol: `${reserveConfig.asset} (${secondaryString})`,
    tvlUsd: (Number(liquidity.availableAmount) / (10**liquidity.mintDecimals) * (liquidity.marketPrice/10**18)),
    apy,
  };

  return newObj;
};

const topLvl = async () => {
  const configResponse = await fetch(
    `${configEndpoint}?deployment=production`,
  );

  const config = await configResponse.json();

  const reservesConfigs = config.markets.flatMap(market => market.reserves.map(reserve => ({
    ...reserve,
    marketName: market.name
  })));

  const reservesResponse = await fetch(
    `${reservesEndpoint}?ids=${reservesConfigs.map(reserve => reserve.address).join(',')}`,
  );

  const reserves = (await reservesResponse.json()).results;

  return Promise.all(reserves.map((reserve, index) => buildPool(reservesConfigs[index], reserve)));
};

const main = async () => {
  const data = await topLvl();

  return data;
};

module.exports = {
  timetravel: false,
  apy: main,
};
