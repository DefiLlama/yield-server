const sdk = require('@defillama/sdk');
const utils = require('../utils');

// Fountain (fURM) -- yield vault of URM, the CDP stablecoin on Base.
// tvlUsd  = URM owed to fURM holders x URM price
// apyBase = realized 7-day APY from fURM share-price growth (compounded);
//           uses the longest window with history while the vault is younger.

const CHAIN = 'base';
const FURM = '0x95fa3FA511Ef8DD9e48453eaE76b241D1c1AC651';
const URM = '0xf0e3349f00972475a5d16721796091aa3b997837';
const URM_ORACLE = '0xa51E78A5B3380516f9CF2c910641703d5c2e45A1';
const POOL_URL = 'https://ultraroundmoney.com/urm/fountain';

const ONE = '1000000000000000000';
const DAY = 86400;
const LOOKBACK_DAYS = [7, 6, 5, 4, 3, 2, 1];

const abi = {
  totalAssets: 'function totalAssets() view returns (uint256)',
  convertToAssets: 'function convertToAssets(uint256 shares) view returns (uint256)',
  twap: 'function getUrmTwapUsdcPrice(uint256 amount, uint32 secondsAgo) view returns (uint256)',
};

// URM price: DefiLlama coins API first; if it has no price, the URM/USDC
// Uniswap V3 TWAP from UrmOracle (USDC, 6 dec, per 1 URM). No hardcoded $1.
async function urmPrice() {
  const key = `${CHAIN}:${URM}`;
  try {
    const { coins } = await utils.getData(`https://coins.llama.fi/prices/current/${key}`);
    if (coins?.[key]?.price > 0) return coins[key].price;
  } catch (e) {}
  for (const secondsAgo of [1800, 60]) {
    try {
      const { output } = await sdk.api.abi.call({
        target: URM_ORACLE, abi: abi.twap, params: [ONE, secondsAgo], chain: CHAIN,
      });
      if (Number(output) > 0) return Number(output) / 1e6;
    } catch (e) {}
  }
  throw new Error('no URM price');
}

// convertToAssets(1 fURM) at a block (latest if omitted). Read errors throw
// rather than being mistaken for missing history.
async function sharePrice(block) {
  const { output } = await sdk.api.abi.call({
    target: FURM, abi: abi.convertToAssets, params: [ONE], chain: CHAIN,
    ...(block ? { block } : {}),
  });
  const pps = Number(output);
  if (!(pps > 0)) throw new Error(`invalid fURM share price at block ${block ?? 'latest'}`);
  return pps;
}

// True once the vault contract exists at `block`. This is the only case that
// falls back to a shorter window; any other failure throws.
async function deployedAt(block) {
  const code = await sdk.getProvider(CHAIN).getCode(FURM, block);
  return typeof code === 'string' && code !== '0x';
}

// One block lookup, retried, since the lookup API can return transient errors.
// A missing or invalid height after retries throws; it never falls back to latest.
async function blockAt(timestamp) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const [height] = await utils.getBlocksByTime([timestamp], CHAIN);
      if (Number.isInteger(height) && height > 0) return height;
    } catch (e) {}
    if (attempt < 3) await new Promise((r) => setTimeout(r, 1000 * attempt));
  }
  throw new Error(`block lookup failed for timestamp ${timestamp}`);
}

// Share price can dip (a CDP debt drop reprices pending interest), and
// yield-server drops pools with apy < 0, so a non-positive change reports 0.
async function apy7d(ppsNow) {
  const now = Math.floor(Date.now() / 1000);
  for (const days of LOOKBACK_DAYS) {
    const block = await blockAt(now - days * DAY);
    if (!(await deployedAt(block))) continue; // vault younger than this window
    const ppsThen = await sharePrice(block);
    if (ppsNow <= ppsThen) return 0;
    return ((ppsNow / ppsThen) ** (365 / days) - 1) * 100;
  }
  return 0; // under 1 day of history
}

const getApy = async () => {
  const [{ output: owed }, { output: held }] = await Promise.all([
    sdk.api.abi.call({ target: FURM, abi: abi.totalAssets, chain: CHAIN }),
    sdk.api.abi.call({ target: URM, abi: 'erc20:balanceOf', params: [FURM], chain: CHAIN }),
  ]);
  // owed to holders, capped by URM held (equal whenever the vault is funded)
  const deposits = BigInt(owed) < BigInt(held) ? owed : held;
  const tvlUsd = (Number(deposits) / 1e18) * (await urmPrice());

  const ppsNow = await sharePrice();

  return [
    {
      pool: `${FURM}-${CHAIN}`.toLowerCase(),
      chain: utils.formatChain(CHAIN),
      project: 'urm',
      symbol: utils.formatSymbol('URM'),
      tvlUsd,
      apyBase: await apy7d(ppsNow),
      underlyingTokens: [URM],
      token: FURM,
      pricePerShare: ppsNow / 1e18,
      poolMeta: 'Fountain',
      url: POOL_URL,
    },
  ];
};

module.exports = {
  protocolId: '9189',
  timetravel: false,
  apy: getApy,
  url: POOL_URL,
};