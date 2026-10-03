const utils = require('../utils');

const API_URL = 'https://api.arrowfarm.io/rpc/vaults';
const CHAIN_ID = 4663;
const CHAIN = 'robinhood';

// ARROWFARM, emitted by ArrowChef to staked vault shares. It is the only reward
// token paid out; the UP gauge emission on UP33 vaults is harvested and
// compounded back into the position, so it is part of apyBase.
const ARROWFARM = '0x416D0C4B431Cfa33b4A4974e3DfC9f5089137148';

// Vaults below this TVL are seed-sized and hidden on the app.
const MIN_TVL_USD = 1000;

const STRATEGY_META = {
  'uniswap-v3': 'Uniswap V3',
  'velodrome-slipstream': 'UP33',
};

const bpsToPercent = (bps) =>
  bps === null || bps === undefined ? null : bps / 100;

const apy = async () => {
  // Arrowfarm's API serves the per-vault APR components it computes from chain
  // reads (24h trading-fee APR, UP gauge APY, ArrowChef emission APR), all in bps.
  const res = await utils.getData(API_URL, { json: { chainId: CHAIN_ID } });
  const vaults = res.json.data;

  return vaults
    .filter((v) => v.chainId === CHAIN_ID && v.status === 'active')
    .filter((v) => Number(v.tvlUsd) >= MIN_TVL_USD)
    .map((v) => {
      // apyBps is the trading-fee APR for uniswap-v3 vaults and the compounded
      // UP gauge APY for velodrome-slipstream vaults; it excludes ARROWFARM.
      const apyBase = bpsToPercent(v.apyBps);
      const apyReward = bpsToPercent(v.arrowAprBps);
      const hasReward = apyReward !== null && apyReward > 0;

      return {
        pool: `${v.address}-${CHAIN}`.toLowerCase(),
        chain: utils.formatChain(CHAIN),
        project: 'arrowfarm',
        symbol: `${v.token0.symbol}-${v.token1.symbol}`,
        tvlUsd: Number(v.tvlUsd),
        apyBase,
        ...(hasReward && { apyReward, rewardTokens: [ARROWFARM] }),
        underlyingTokens: [v.token0.address, v.token1.address],
        token: v.address,
        poolMeta: STRATEGY_META[v.strategyType],
        url: 'https://www.arrowfarm.io',
      };
    })
    .filter(utils.keepFinite);
};

module.exports = {
  protocolId: '8852',
  timetravel: false,
  apy,
  url: 'https://www.arrowfarm.io',
};
