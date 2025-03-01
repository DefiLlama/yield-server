const utils = require('../utils');
const axios = require('axios');

const apy = async () => {
  const tvlData = await utils.getData(
    'https://data.osmosis.zone/pairs/v2/summary'
  );

  const aprData = await axios.get('https://osmosis.numia.xyz/pools_apr_range', {
    headers: {
      Authorization: `Bearer ${process.env.OSMOSIS_API_KEY}`,
      'Content-Type': 'application/json',
    },
  });

  const data = tvlData.data.map((pool) => {
    const symbol = `${pool.base_symbol}-${pool.quote_symbol}`;

    if (symbol.includes(undefined)) return null;

    const apr = aprData.data.find((i) => i.pool_id === pool.pool_id);
    if (!apr) return null;
    const apyBase = apr.swap_fees.lower;

    return {
      pool: `osmosis-${pool.pool_id}`,
      chain: 'Osmosis',
      project: 'osmosis-dex',
      symbol: utils.formatSymbol(symbol),
      tvlUsd: pool.liquidity,
      apyBase,
      apyBase7d: apyBase,
      volumeUsd1d: pool.volume_24h,
      volumeUsd7d: pool.volume_7d,
      url: `https://app.osmosis.zone/pool/${pool.pool_id}`,
      poolMeta: `#${pool.pool_id}`,
    };
  });

  return utils.removeDuplicates(
    data.filter((p) => p && utils.keepFinite(p) && p.tvlUsd < 50e6)
  );
};

module.exports = {
  apy,
};
