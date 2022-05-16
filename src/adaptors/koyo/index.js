const utils = require('../utils');

const getData = async (chainString) => {
    const rawTVLData = await utils.getData(`https://api.exchange.koyo.finance/tvls/${chainString}`);
    const TVLPools = rawTVLData.data.pools;
    const TVLData = Object.entries(TVLPools).map(([, pool]) => pool);

    const rawAPYData = await utils.getData(`https://api.exchange.koyo.finance/apys/raw/${chainString}`);
    const APYData = rawAPYData.data.apy;

    for (const el of TVLData) {
        el.apy = APYData.day[el.id];
    }

    return TVLData;
}

const buildPool = (entry, chainString) => {
    const apy = (entry.apy < 0 ? 0 : entry.apy) * 100;

    return {
        pool: entry.address,
        chain: utils.formatChain(chainString),
        project: 'koyo',
        symbol: utils.formatSymbol(entry.id),
        tvlUsd: entry.tvl,
        apy,
    };
  };

const topLvl = async (chainString, url) => {
    const poolStats = await getData(chainString);

    const data = poolStats.map((el) => buildPool(el, chainString));

    return data;
};

const main = async () => {
  const data = await Promise.all([topLvl('boba')]);

  return data.flat();
};

module.exports = {
  timetravel: false,
  apy: main,
};
