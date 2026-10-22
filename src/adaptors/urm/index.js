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

// convertToAssets(1 fURM) at a block; null if the vault did not exist yet.
async function sharePrice(block) {
  try {
    const { output } = await sdk.api.abi.call({
      target: FURM, abi: abi.convertToAssets, params: [ONE], chain: CHAIN,
      ...(block ? { block } : {}),
    });
    return Number(output) > 0 ? Number(output) : null;
  } catch (e) {
    return null;
  }
}

// Share price can dip (a CDP debt drop reprices pending interest), and
// yield-server drops pools with apy < 0, so a non-positive change reports 0.
async function apy7d(ppsNow) {
  const now = Math.floor(Date.now() / 1000);
  const blocks = await utils.getBlocksByTime(LOOKBACK_DAYS.map((d) => now - d * DAY), CHAIN);
  for (let i = 0; i < LOOKBACK_DAYS.length; i++) {
    const ppsThen = await sharePrice(blocks[i]);
    if (!ppsThen) continue; // vault younger than this window
    if (ppsNow <= ppsThen) return 0;
    return ((ppsNow / ppsThen) ** (365 / LOOKBACK_DAYS[i]) - 1) * 100;
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
  if (!ppsNow) throw new Error('could not read fURM share price');

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