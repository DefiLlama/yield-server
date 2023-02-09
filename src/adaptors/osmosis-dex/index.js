const utils = require('../utils');

const getApy = async () => {
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
    const apr14day = apr
      .find((x) => String(x.pool_id) === poolId)
      ?.apr_list.find((el) => el.symbol === 'OSMO')?.apr_14d;

    const y = { ...x };
    y.apr = apr14day;
    data.push(y);
  }

  data = data.map((p) => {
    const poolSplit = p.denom.split('/');
    const pool = poolSplit.length > 1 ? poolSplit[1] : poolSplit[0];

    return {
      pool: `${pool}-${p.symbol}-14day`,
      chain: 'Osmosis',
      project: 'osmosis-dex',
      symbol: utils.formatSymbol(p.symbol),
      poolMeta: '14day',
      tvlUsd: p.liquidity,
      apy: p.apr,
    };
  });

  return data.filter((p) => utils.keepFinite(p));
};

module.exports = {
  timetravel: false,
  apy: getApy,
  url: 'https://app.osmosis.zone/pools',
};
