const axios = require('axios');
const utils = require('../utils');

const API = 'https://dlmm.datapi.meteora.ag/pools';
const PAGE_SIZE = 1000;
const MAX_PAGES = 200;
const MIN_TVL = 10_000;
const NULL_MINT = '11111111111111111111111111111111';

// meteora marks tvl at the pool's own price, which an idle pool leaves far off
// market. priced sides take the coins.llama.fi price; an unpriced side takes
// the pool's price, capped at the priced side, as in raydium-amm
const tvlUsd = (p, prices) => {
  const priceOf = (token) => {
    const price = prices[`solana:${token.address}`]?.price;
    return price > 0 ? price : undefined;
  };
  const priceX = priceOf(p.token_x);
  const priceY = priceOf(p.token_y);
  if (priceX === undefined && priceY === undefined) return p.tvl;
  let tvl;
  if (priceX !== undefined && priceY !== undefined) {
    tvl = p.token_x_amount * priceX + p.token_y_amount * priceY;
  } else {
    const [priced, unpriced] =
      priceX === undefined
        ? [
            p.token_y_amount * priceY,
            p.token_x_amount * p.current_price * priceY,
          ]
        : [
            p.token_x_amount * priceX,
            (p.token_y_amount / p.current_price) * priceX,
          ];
    tvl = p.current_price > 0 ? priced + Math.min(unpriced, priced) : priced;
  }
  return Number.isFinite(tvl) ? Math.min(p.tvl, tvl) : p.tvl;
};

const apy = async () => {
  const kept = [];
  const seen = new Set();

  // pools are sorted by tvl desc, stop once a page drops below the tvl floor
  for (let page = 1; page <= MAX_PAGES; page++) {
    const { data } = await axios.get(
      `${API}?page=${page}&page_size=${PAGE_SIZE}&sort_by=tvl%3Adesc`
    );
    const rows = data.data || [];
    if (!rows.length) break;

    for (const p of rows) {
      if (p.is_blacklisted || !(p.tvl >= MIN_TVL)) continue;
      // the tvl ordering is live, a pool can show up on two pages
      if (seen.has(p.address)) continue;
      seen.add(p.address);
      kept.push(p);
    }

    if (!(rows[rows.length - 1].tvl >= MIN_TVL)) break;
  }

  const prices = await utils.getPriceApiCoins(
    [
      ...new Set(kept.flatMap((p) => [p.token_x.address, p.token_y.address])),
    ].map((mint) => `solana:${mint}`)
  );

  return kept.map((p) => {
    const rewardTokens = [p.reward_mint_x, p.reward_mint_y].filter(
      (m) => m && m !== NULL_MINT
    );
    const hasRewards = p.has_farm && p.farm_apr > 0 && rewardTokens.length > 0;

    return {
      pool: p.address,
      chain: 'Solana',
      project: 'meteora-dlmm',
      symbol: p.name,
      tvlUsd: tvlUsd(p, prices),
      // fee_tvl_ratio is LP fees (net of protocol fees) / tvl, in percent
      apyBase: (p.fee_tvl_ratio?.['24h'] || 0) * 365,
      ...(hasRewards && { apyReward: p.farm_apr, rewardTokens }),
      underlyingTokens: [p.token_x.address, p.token_y.address],
      volumeUsd1d: p.volume?.['24h'] || 0,
      poolMeta: `${+p.pool_config.base_fee_pct.toFixed(4)}% - binStep ${
        p.pool_config.bin_step
      }`,
      url: `https://app.meteora.ag/dlmm/${p.address}`,
    };
  });
};

module.exports = {
  protocolId: '4148',
  timetravel: false,
  apy,
  url: 'https://app.meteora.ag/',
};
