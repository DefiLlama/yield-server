const utils = require('../utils');

const buildPool = (entry, chainString) => {
  const poolSplit = entry.denom.split('/');
  const pool = poolSplit.length > 1 ? poolSplit[1] : poolSplit[0];

  const newObj = {
    pool: `${pool}-${entry.symbol}-${entry.duration}`,
    chain: utils.formatChain(chainString),
    project: 'osmosis-dex',
    symbol: utils.formatSymbol(entry.symbol),
    poolMeta: entry.duration,
    tvlUsd: entry.liquidity,
    apy: entry.apr,
    poolMeta: entry.duration,
  };

  return newObj;
};

const topLvl = async (chainString) => {
  const tvl = await utils.getData(
    'https://api-osmosis.imperator.co/pools/v2/all?low_liquidity=false'
  );
  const apr = await utils.getData(
    'https://api-osmosis.imperator.co/apr/v2/all'
  );

  let data = [];
  for (const poolId of Object.keys(tvl)) {
    const pos = tvl[poolId];
    const symbol = `${pos[0].symbol}-${pos[1].symbol}`;

    const x = pos[0];
    x.poolId = poolId;
    x.symbol = symbol;
    aprs = apr
      .find((x) => String(x.pool_id) === poolId)
      ?.apr_list.find((el) => el.symbol === 'OSMO');

    // add all 3 apy durations
    for (const d of [1, 7, 14]) {
      const y = { ...x };
      y.apr = aprs?.[`apr_${d}d`];
      y.duration = `${d}day`;
      data.push(y);
    }
  }

  data = data.map((el) => buildPool(el, chainString));

  return data.filter((p) => utils.keepFinite(p));
};

const main = async () => {
  const data = await topLvl('osmosis');
  return data;
};

module.exports = {
  timetravel: false,
  apy: main,
  url: 'https://app.osmosis.zone/pools',
};
