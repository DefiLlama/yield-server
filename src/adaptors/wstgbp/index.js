const sdk = require('@defillama/sdk');
const axios = require('axios');
const { getPriceApiUrl } = require('../utils');

const CHAIN = 'ethereum';
const WSTGBP = '0x57C3571f10767E49C9d7b60feb6c67804783B7aE';
const TGBP = '0x27f6c8289550fCE67f6B50BeD1F519966aFE5287';
// NAV price oracle (pip) proxy. Emits Poke(price, timestamp) on every update.
const PIP = '0x6A79dCe61A12aa4b75449e0B03746260765D07dF';

const SECONDS_PER_DAY = 86400;
const DAYS_PER_YEAR = 365;
const LOOKBACK_DAYS = 30;
// Scan 120 days for an anchor at least 30 days before the latest poke.
// APY is null when the scan contains no valid anchor.
// Ingestion then omits the pool for that run; this is intentional whenever
// there is insufficient history to support the 30d label.
const SCAN_DAYS = 120;

const eventPoke =
  'event Poke(uint256 indexed price, uint256 indexed timestamp)';

// wstGBP is not ERC-4626 and does not rebase. Yield accrues as the NAV oracle
// price rises (tGBP per wstGBP). The NAV is published on a weekly cadence, so
// the APY is anchored on actual Poke events rather than fixed-time samples.
// This avoids step-function noise depending on where a window boundary lands
// relative to a poke.
const getApyBase = async () => {
  const latest = await sdk.api.util.getLatestBlock(CHAIN);
  const { block: fromBlock } = await sdk.api.util.lookupBlock(
    latest.timestamp - SCAN_DAYS * SECONDS_PER_DAY,
    { chain: CHAIN }
  );

  const logs = await sdk.getEventLogs({
    target: PIP,
    eventAbi: eventPoke,
    fromBlock,
    toBlock: latest.number,
    chain: CHAIN,
    onlyArgs: true,
  });

  // Pauses publish price 0. Drop them.
  const pokes = logs
    .map((l) => ({ price: Number(l.price) / 1e18, ts: Number(l.timestamp) }))
    .filter((p) => p.price > 0)
    .sort((a, b) => a.ts - b.ts);

  if (pokes.length < 2) return null;

  const end = pokes[pokes.length - 1];
  // Allow two weekly update cycles before treating the NAV as stale.
  if (latest.timestamp - end.ts > 14 * SECONDS_PER_DAY) return 0;

  const target = end.ts - LOOKBACK_DAYS * SECONDS_PER_DAY;
  let start = pokes[0];
  for (let i = pokes.length - 1; i >= 0; i--) {
    if (pokes[i].ts <= target) {
      start = pokes[i];
      break;
    }
  }
  // Never publish a shorter window under the 30d label.
  if (start.ts > target) return null;

  const elapsedDays = (end.ts - start.ts) / SECONDS_PER_DAY;
  if (elapsedDays <= 0) return null;

  return (
    (Math.pow(end.price / start.price, DAYS_PER_YEAR / elapsedDays) - 1) * 100
  );
};

const apy = async () => {
  const priceKey = `${CHAIN}:${TGBP}`;
  const [apyBase, navRes, reserveRes, priceRes] = await Promise.all([
    getApyBase(),
    sdk.api.abi.call({ target: WSTGBP, abi: 'uint256:navprice', chain: CHAIN }),
    sdk.api.erc20.balanceOf({ target: TGBP, owner: WSTGBP, chain: CHAIN }),
    axios.get(getPriceApiUrl(`/prices/current/${priceKey}`)),
  ]);

  const tgbpUsd = priceRes.data.coins[priceKey]?.price ?? 0;
  // TVL matches the DefiLlama TVL adapter: tGBP reserve held by the wstGBP
  // contract on Ethereum.
  const tvlUsd = (Number(reserveRes.output) / 1e18) * tgbpUsd;
  // Underlying (tGBP) per 1 wstGBP. This is not a USD price.
  const pricePerShare = Number(navRes.output) / 1e18;

  return [
    {
      pool: `${WSTGBP.toLowerCase()}-${CHAIN}`,
      chain: 'Ethereum',
      project: 'wstgbp',
      symbol: 'wstGBP',
      tvlUsd,
      apyBase,
      underlyingTokens: [TGBP],
      pricePerShare,
      isIntrinsicSource: true,
      poolMeta: '0.25% redeem fee',
      url: 'https://wstgbp.com',
    },
  ];
};

module.exports = {
  protocolId: '8266',
  timetravel: false,
  apy,
  url: 'https://wstgbp.com',
};
