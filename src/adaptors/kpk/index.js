const sdk = require('@defillama/sdk');
const utils = require('../utils');

const PROJECT = 'kpk';

// NAVCalculator: one fund-agnostic UUPS proxy, same address on every chain it is deployed on.
// getAccountNav values every position a Safe holds, quoted in the asset passed as quoteAsset.
const NAV_CALCULATOR = '0x54EaD2A1dB7456cA917675Ea8908ec8A997c6214';

const DAY = 86400;
const WINDOW_DAYS = 7;

// kpk funds (onchain investment vehicles). Each one is a kpkShares ERC-20 whose assets sit in a
// Portfolio Safe; the share contract does not track NAV itself, so NAV per share is read as
// NAVCalculator.getAccountNav(portfolioSafe, denominationAsset) / totalSupply.
const FUNDS = [
  { chain: 'ethereum', shares: '0xf180800f239f0ea0ED2F8156581fac2984cEe389', name: 'BTC Carry', slug: 'btc-carry' },
];

const ASSET = '(address asset, string symbol, uint8 decimals)';
const abis = {
  portfolioSafe: 'address:portfolioSafe',
  getApprovedAssets: 'function getApprovedAssets() view returns (address[])',
  getAccountNav:
    `function getAccountNav(address account, address quoteAsset) view returns ((int256 value, ${ASSET} quoteAsset, uint64 timestamp, ${ASSET}[] stalePriceAssets, bool sequencerDown, bool quoteAssetStale, ${ASSET}[] irregularPriceAssets, bool quoteAssetIrregular, ${ASSET}[] monitorsUnhealthyPriceAssets) nav)`,
};

// NAV per share in units of the denomination asset, or { skip } when the reading cannot be trusted:
// a stale or irregular price feed makes the calculator leave positions out (NAV can even read 0),
// so such a sample is dropped rather than turned into a yield spike.
const navPerShare = async ({ chain, shares, safe, asset, decimals, block }) => {
  let nav, supply;
  try {
    [nav, supply] = await utils.withRetry(() =>
      Promise.all([
        sdk.api2.abi.call({ target: NAV_CALCULATOR, abi: abis.getAccountNav, params: [safe, asset], chain, block }),
        sdk.api2.abi.call({ target: shares, abi: 'erc20:totalSupply', chain, block }),
      ])
    );
  } catch (e) {
    return { skip: `call failed at block ${block}: ${e.message}` };
  }
  if (BigInt(supply) === 0n) return { skip: `no shares at block ${block}` };
  const unhealthy =
    nav.sequencerDown || nav.quoteAssetStale || nav.quoteAssetIrregular ||
    nav.stalePriceAssets.length || nav.irregularPriceAssets.length || nav.monitorsUnhealthyPriceAssets.length;
  if (unhealthy) return { skip: `unhealthy price feeds at block ${block}` };
  if (BigInt(nav.value) <= 0n) return { skip: `non-positive NAV at block ${block}` };
  const navAssets = Number(nav.value) / 10 ** decimals;
  return { nps: navAssets / (Number(supply) / 1e18), navAssets };
};

const fundInfo = async (fund) => {
  const { chain, shares } = fund;
  const [safe, approved] = await Promise.all([
    sdk.api2.abi.call({ target: shares, abi: abis.portfolioSafe, chain }),
    sdk.api2.abi.call({ target: shares, abi: abis.getApprovedAssets, chain }),
  ]);
  // the first approved asset is the fund's denomination asset (WBTC for BTC Carry)
  const asset = approved[0];
  const [decimals, symbol] = await Promise.all([
    sdk.api2.abi.call({ target: asset, abi: 'erc20:decimals', chain }),
    sdk.api2.abi.call({ target: asset, abi: 'erc20:symbol', chain }),
  ]);
  return { ...fund, safe, asset, decimals: Number(decimals), symbol, priceKey: `${chain}:${asset.toLowerCase()}` };
};

const fundPool = async (fund, blocks, prices) => {
  const { chain, shares, asset, symbol } = fund;
  const [now, before] = await Promise.all([
    navPerShare({ ...fund, block: blocks[chain].now }),
    navPerShare({ ...fund, block: blocks[chain].before }),
  ]);
  const price = prices[fund.priceKey]?.price;
  const skip = now.skip || before.skip || (!price && `no price for ${fund.priceKey}`);
  if (skip) {
    console.log(`kpk: skipping ${fund.name}: ${skip}`);
    return null;
  }

  // Management and performance fees accrue daily but are collected as newly minted shares, usually
  // at the start of each month and at redemptions. Most 7-day windows are therefore gross of fees;
  // a window that spans a collection absorbs the fees accrued since the previous one.
  const apyBase = ((now.nps / before.nps) ** (365 / WINDOW_DAYS) - 1) * 100;

  return {
    pool: `${shares}-${chain}`.toLowerCase(),
    chain: utils.formatChain(chain),
    project: PROJECT,
    symbol: utils.formatSymbol(symbol),
    poolMeta: fund.name,
    tvlUsd: now.navAssets * price,
    apyBase,
    underlyingTokens: [asset],
    token: shares,
    pricePerShare: now.nps,
    url: `https://docs.kpk.io/funds/funds/${fund.slug}`,
  };
};

const apy = async () => {
  const chains = [...new Set(FUNDS.map((f) => f.chain))];
  const nowTs = Math.floor(Date.now() / 1000);
  const blocks = {};
  await Promise.all(
    chains.map(async (chain) => {
      const [before, now] = await utils.getBlocksByTime([nowTs - WINDOW_DAYS * DAY, nowTs - 60], chain);
      blocks[chain] = { before, now };
    })
  );

  const funds = await Promise.all(FUNDS.map(fundInfo));
  const coins = await utils.getPriceApiCoins([...new Set(funds.map((f) => f.priceKey))]);
  const prices = Object.fromEntries(Object.entries(coins).map(([k, v]) => [k.toLowerCase(), v]));

  const pools = await Promise.all(funds.map((f) => fundPool(f, blocks, prices)));
  return pools.filter(Boolean).filter(utils.keepFinite);
};

module.exports = {
  protocolId: '4146',
  timetravel: false,
  apy,
  url: 'https://docs.kpk.io/funds',
};
