// Lodestar (Flare): no-liquidation, fixed-term lending. Lenders supply USDT0 to an ERC-4626 pool
// (lodUSDT0) and earn the one-time fees borrowers pay up front; nothing is emitted, so the only yield
// is the share price rising. The APY below is therefore the realised share-price change, annualised
// over a trailing window, which is exactly what a depositor would have earned. It reads 0 while the
// book is empty rather than quoting a projection.
//
// NOT the same protocol as `lodestar` / `lodestar-v1` (Lodestar Finance on Arbitrum). Slug
// `lodestar-protocol`, after lodestarprotocol.xyz.
const sdk = require('@defillama/sdk');
const utils = require('../utils');

const CHAIN = 'flare';
const POOL = '0x87b09bE7A253C2af187c9af17cDEDcEAf4A9780E'; // LodestarPool, ERC-4626, genesis 2026-08-29
const USDT0 = '0xe7cd86e13AC4309349F30B3435a9d337750fC82D'; // 6 decimals
const GENESIS_BLOCK = 68517390; // the pool did not exist before this; the window never reaches back past it
const GENESIS_TS = 1756425600; // 2026-08-29 00:00 UTC
const ONE_SHARE = '1000000000000'; // lodUSDT0 is 12 dp (6 dp asset + 6 dp virtual offset)
const WINDOW_DAYS = 30;

const abi = {
  totalAssets: 'function totalAssets() view returns (uint256)',
  principalOut: 'function principalOut() view returns (uint256)',
  convertToAssets: 'function convertToAssets(uint256 shares) view returns (uint256)',
};

const call = async (target, abiStr, params, block) =>
  (await sdk.api.abi.call({ target, abi: abiStr, params, chain: CHAIN, block })).output;

const apy = async () => {
  const now = Math.floor(Date.now() / 1000);
  const [totalAssets, principalOut, spNow] = await Promise.all([
    call(POOL, abi.totalAssets),
    call(POOL, abi.principalOut),
    call(POOL, abi.convertToAssets, [ONE_SHARE]),
  ]);

  // share price at the start of the window, or at genesis if the pool is younger than the window
  const windowStart = Math.max(now - WINDOW_DAYS * 86400, GENESIS_TS);
  let apyBase = 0;
  try {
    const [blockThen] = await utils.getBlocksByTime([windowStart], CHAIN);
    const block = Math.max(Number(blockThen), GENESIS_BLOCK);
    const spThen = await call(POOL, abi.convertToAssets, [ONE_SHARE], block);
    const days = Math.max(1, (now - windowStart) / 86400);
    if (Number(spThen) > 0) apyBase = (Number(spNow) / Number(spThen) - 1) * (365 / days) * 100;
  } catch (e) {
    // a failed historical read must not fake a number; the pool is simply reported with apyBase 0
    apyBase = 0;
  }

  // USDT0 is Tether's omnichain dollar; price it, with a $1 fallback if the price API has no key for it
  let price = 1;
  try {
    const p = (await utils.getPriceApiData(`/prices/current/${CHAIN}:${USDT0}`)).coins;
    const k = Object.keys(p)[0];
    if (k && p[k].price) price = p[k].price;
  } catch (e) {}

  const tvlUsd = (Number(totalAssets) / 1e6) * price;
  const totalBorrowUsd = (Number(principalOut) / 1e6) * price;

  return [
    {
      pool: `${POOL.toLowerCase()}-${CHAIN}`,
      chain: utils.formatChain(CHAIN),
      project: 'lodestar-protocol',
      symbol: 'USDT0',
      tvlUsd,
      apyBase: Math.max(0, apyBase),
      underlyingTokens: [USDT0],
      totalSupplyUsd: tvlUsd + totalBorrowUsd,
      totalBorrowUsd,
      ltv: 0.5,
      poolMeta: 'lodUSDT0: fees from 7/30/90-day no-liquidation loans, no lockup',
      url: 'https://lodestarprotocol.xyz/app#lend',
    },
  ];
};

module.exports = {
  protocolId: 'FILL_FROM_https://api.llama.fi/protocols_ONCE_lodestar-protocol_IS_LISTED',
  timetravel: false,
  apy,
  url: 'https://lodestarprotocol.xyz/app#lend',
};
