// Anemoy Capital — DefiLlama Yield Adapter
// ===========================================================
// Anemoy issues JTRSY, the Janus Henderson Treasury Fund: a tokenized fund
// holding short-dated US Treasuries, distributed through Centrifuge's
// ERC-7540 asynchronous vaults on Ethereum, Base and Celo.
//
// JTRSY is a fixed-balance ERC-20 — it does not rebase. Yield accrues through
// the fund's NAV, exposed as `pricePerShare()` on the vault that the LTF
// contract returns for a given settlement asset (USDC here). This mirrors how
// the TVL adapter (projects/anemoy-capital) values the same token.
//
//   - tvlUsd  : LTF.totalSupply() x pricePerShare, both 6-decimal, USDC-
//               denominated, then priced at the USDC rate from coins.llama.fi.
//   - apyBase : realised growth in pricePerShare over a trailing 7-day window,
//               annualised. This is the fund's actual accrual — no projection
//               and no off-chain rate.
//
// NAV is a single fund-level number, so it is read once on Ethereum and
// applied to every chain's supply, exactly as the TVL adapter does. The
// per-chain pools differ only in the size of the float deployed there.
//
// Guard: if the archive read for the prior window fails, or the window shows
// no growth, the pool publishes tvlUsd with no apyBase rather than failing
// the adapter or asserting a rate it cannot evidence.

const sdk = require('@defillama/sdk');
const utils = require('../utils');

const PROJECT = 'anemoy-capital';
const URL = 'https://www.anemoy.io';
const NAV_CHAIN = 'ethereum';
const USDC = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';

// LTF (JTRSY) deployments, matching projects/anemoy-capital/index.js
const LTF = {
  ethereum: '0x8c213ee79581ff4984583c6a801e5263418c4b86',
  base: '0x8c213ee79581ff4984583c6a801e5263418c4b86',
  celo: '0x27e8c820d05aea8824b1ac35116f63f9833b54c8',
};

const DAY = 86400;
const LOOKBACK_DAYS = 7;

// A short-duration treasury fund cannot sustainably print above this; anything
// higher is a NAV restatement or a bad archive read, not a rate.
const MAX_PLAUSIBLE_APY = 15;

const VAULT_ABI = 'function vault(address asset) view returns (address)';
const PPS_ABI = 'uint256:pricePerShare';

const call = async (target, abi, chain, params, block) =>
  (
    await sdk.api.abi.call({
      target,
      abi,
      chain,
      ...(params ? { params } : {}),
      ...(block ? { block } : {}),
    })
  ).output;

const apy = async () => {
  // 1. Resolve the USDC vault and read NAV per share now.
  const vault = await call(LTF[NAV_CHAIN], VAULT_ABI, NAV_CHAIN, [USDC]);
  const ppsNow = Number(await call(vault, PPS_ABI, NAV_CHAIN));
  if (!Number.isFinite(ppsNow) || ppsNow <= 0) {
    throw new Error(
      `Invalid pricePerShare from Anemoy vault ${vault}: ${ppsNow}`,
    );
  }

  // 2. NAV one window ago, for the realised rate.
  let apyBase;
  try {
    const now = Math.floor(Date.now() / 1e3);
    const block = (
      await utils.getBlocksByTime([now - LOOKBACK_DAYS * DAY], NAV_CHAIN)
    )[0];
    const ppsPrior = Number(await call(vault, PPS_ABI, NAV_CHAIN, null, block));
    if (Number.isFinite(ppsPrior) && ppsPrior > 0) {
      const ann = ((ppsNow / ppsPrior) ** (365 / LOOKBACK_DAYS) - 1) * 100;
      if (Number.isFinite(ann) && ann > 0 && ann <= MAX_PLAUSIBLE_APY)
        apyBase = ann;
    }
  } catch (e) {
    apyBase = undefined; // no archive read available; publish TVL only
  }

  // 3. USDC price, so TVL is quoted through the same source as the rest of the repo.
  const priceKey = `${NAV_CHAIN}:${USDC.toLowerCase()}`;
  const priceData = await utils.getPriceApiData(`/prices/current/${priceKey}`);
  const usdcPrice = priceData?.coins?.[priceKey]?.price;
  if (!Number.isFinite(usdcPrice) || usdcPrice <= 0) {
    throw new Error(`Invalid USDC price for ${priceKey}: ${usdcPrice}`);
  }

  // 4. One pool per chain, sized by the float deployed there.
  const chains = Object.keys(LTF);
  const supplies = await Promise.all(
    chains.map((chain) =>
      call(LTF[chain], 'uint256:totalSupply', chain).catch(() => null),
    ),
  );
  const decimals = await Promise.all(
    chains.map((chain) =>
      call(LTF[chain], 'uint8:decimals', chain).catch(() => null),
    ),
  );

  return chains
    .map((chain, i) => {
      const supply = Number(supplies[i]);
      const dec = Number(decimals[i]);
      if (!Number.isFinite(supply) || !Number.isFinite(dec)) return null;

      // pricePerShare is quoted in the settlement asset's decimals (USDC, 6).
      const tvlUsd = (supply / 10 ** dec) * (ppsNow / 1e6) * usdcPrice;
      if (!Number.isFinite(tvlUsd) || tvlUsd < utils.MIN_TVL_USD) return null;

      return {
        pool: `${LTF[chain]}-${chain}`.toLowerCase(),
        chain: utils.formatChain(chain),
        project: PROJECT,
        symbol: 'JTRSY',
        tvlUsd,
        ...(apyBase !== undefined ? { apyBase } : {}),
        underlyingTokens: [USDC],
        token: LTF[chain],
        url: URL,
      };
    })
    .filter(Boolean);
};

module.exports = {
  timetravel: false,
  apy,
  url: URL,
  // DefiLlama protocol id for slug "anemoy-capital"
  // (TVL adapter projects/anemoy-capital/index.js).
  protocolId: '5481',
};
