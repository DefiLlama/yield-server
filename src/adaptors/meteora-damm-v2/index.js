const axios = require('axios');

const API = 'https://damm-v2.datapi.meteora.ag/pools';
const PAGE_SIZE = 99;
const MAX_PAGES = 200;
const MIN_TVL = 10_000;

const apy = async () => {
  const pools = [];

  // pools are sorted by tvl desc, stop once a page drops below the tvl floor
  for (let page = 1; page <= MAX_PAGES; page++) {
    const { data } = await axios.get(
      `${API}?page=${page}&page_size=${PAGE_SIZE}&sort_by=tvl%3Adesc`
    );
    const rows = data.data || [];
    if (!rows.length) break;

    for (const p of rows) {
      if (p.is_blacklisted || !(p.tvl >= MIN_TVL)) continue;

      pools.push({
        pool: p.address,
        chain: 'Solana',
        project: 'meteora-damm-v2',
        symbol: p.name,
        tvlUsd: p.tvl,
        // fee_tvl_ratio is LP fees (net of protocol fees) / tvl, in percent
        // farm rewards are not included: the api doesn't expose the reward mints
        apyBase: (p.fee_tvl_ratio?.['24h'] || 0) * 365,
        underlyingTokens: [p.token_x.address, p.token_y.address],
        volumeUsd1d: p.volume?.['24h'] || 0,
        poolMeta: `${+p.pool_config.base_fee_pct.toFixed(4)}%`,
        url: `https://app.meteora.ag/dammv2/${p.address}`,
      });
    }

    if (!(rows[rows.length - 1].tvl >= MIN_TVL)) break;
  }

  return pools;
};

module.exports = {
  protocolId: '6288',
  timetravel: false,
  apy,
  url: 'https://app.meteora.ag/',
};
