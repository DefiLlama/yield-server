const fetch = require('node-fetch');

const utils = require('../utils');

const baseUrl = 'https://api.solend.fi';
const configEndpoint = `${baseUrl}/v1/config`;
const reservesEndpoint = `${baseUrl}/v1/reserves`;

const buildPool = async (reserveConfig, reserveData) => {
  const liquidity = reserveData.reserve.liquidity;
  const apy =
    Number(reserveData.rates.supplyInterest) +
    reserveData.rewards.reduce(
      (acc, reward) =>
        reward.side === 'supply' ? (Number(reward.apy) || 0) + acc : acc,
      0
    );
  const secondaryString =
    reserveConfig.marketName.charAt(0).toUpperCase() +
    reserveConfig.marketName.slice(1) +
    ' Pool';

  const newObj = {
    pool: reserveConfig.address,
    chain: utils.formatChain('solana'),
    project: 'solend',
    symbol: `${reserveConfig.asset}`,
    poolMeta: secondaryString,
    tvlUsd:
      (Number(liquidity.availableAmount) / 10 ** liquidity.mintDecimals) *
      (liquidity.marketPrice / 10 ** 18),
    apy,
  };

  return newObj;
};

const topLvl = async () => {
  const configResponse = await fetch(`${configEndpoint}?deployment=production`);

  const config = await configResponse.json();

  const reservesConfigs = config.markets.flatMap((market) =>
    market.reserves.map((reserve) => ({
      ...reserve,
      marketName: market.name,
    }))
  );

  // note(slasher): seems like the solend team has made changes to the reserveEndpoint
  // which now has a limit of max 5 ids, hence why i made this change to loop instead
  const tokenIds = reservesConfigs.map((reserve) => reserve.address);
  const reserves = [];
  const maxIds = 5;
  for (let i = 0; i <= tokenIds.length; i += maxIds) {
    const tokens = tokenIds.slice(i, i + 5).join(',');

    const reservesResponse = await fetch(`${reservesEndpoint}?ids=${tokens}`);
    const res = (await reservesResponse.json()).results;

    if (res === undefined) continue;
    reserves.push(res);
  }

  return Promise.all(
    reserves
      .flat()
      .map((reserve, index) => buildPool(reservesConfigs[index], reserve))
  );
};

const main = async () => {
  const data = await topLvl();

  return data;
};

module.exports = {
  timetravel: false,
  apy: main,
  url: 'https://solend.fi/pools',
};
