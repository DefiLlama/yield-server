// 3F (Grunt) — DefiLlama Yield Adapter
// ===========================================================
// 3F provides leveraged exposure to tokenized real-world assets. A user picks an
// RWA vault and a leverage tier; the protocol loops it through a Morpho Blue
// market behind the scenes, bridging the RWA's asynchronous settlement window
// with short-term facilitator loans.
//
// Each leverage tier is a separate `PositionManager` contract — an ERC-20 share
// token whose `totalAssets()` is the tier's net asset value, denominated in the
// market's debt asset (USDC). Levered collateral value minus debt, so it is
// already net of borrowings and does not double-count the underlying Morpho
// market's collateral.
//
// One pool is published per deployed leverage tier. As of writing that is the
// wJAAA (Janus Henderson Anemoy AAA CLO), wUSCC (Bitwise USCC) and wFalconX
// (Pareto AA tranche of the FalconX credit vault) markets.
//
// Everything is read on-chain at adapter run-time (no 3F API dependency):
//   - discovery : PositionManagerCreated logs from the PositionManager factory,
//                 which also carry each tier's target LTV.
//   - tvlUsd    : PositionManager.totalAssets() (debt-asset units) x debt-asset
//                 price from coins.llama.fi. This is depositor equity, not the
//                 gross levered collateral.
//   - apyBase   : realised growth in share price (totalAssets / totalSupply)
//                 over a trailing 7-day window, annualised. This is what a
//                 depositor in that tier actually earned — already net of
//                 borrow cost, management fee and performance fee, since fees
//                 are minted as diluting shares. No projection, no off-chain
//                 rate, no modelled spread.
//   - ltv       : the tier's target LTV, straight from the creation event.
//
// Why realised share price rather than a modelled spread: the headline yield on
// a levered RWA position is L*r_collateral - (L-1)*r_borrow, but r_collateral
// for an async-settling RWA fund is only observable through its NAV oracle, and
// the borrow leg floats with Morpho utilisation. Share-price growth captures
// both legs plus fees as actually realised, which is the lower-bound,
// attainable number DefiLlama asks for.
//
// Guards and conventions:
//   - Tiers with no supply, or too young for the lookback, publish apyBase 0
//     rather than failing the adapter.
//   - A tier whose realised share price *fell* over the window publishes
//     apyBase 0, not a negative rate, matching the rest of the yields API
//     (no pool currently reports a negative apyBase). This is a live condition
//     on this protocol rather than a theoretical one: when the RWA coupon sits
//     below the Morpho borrow rate the levered carry inverts and NAV per share
//     declines, which at the time of writing is the case on the wFalconX
//     tiers. Those tiers therefore report 0 until the spread turns positive.
//   - Tiers below utils.MIN_TVL_USD are dropped. Several tiers hold dust, and
//     annualising a share-price wobble on a sub-dollar balance produces
//     meaningless rates.

const sdk = require('@defillama/sdk');
const utils = require('../utils');

const CHAIN = 'ethereum';
const PROJECT = '3f';
const URL = 'https://www.3f.xyz/';

const POSITION_MANAGER_FACTORY = '0x8e0667429d1717b3e5fe783a6c472d6d901fe5fa';
const FACTORY_DEPLOY_BLOCK = 24844184;

const DAY = 24 * 3600;
const LOOKBACK_DAYS = 7;
const LOOKBACK = LOOKBACK_DAYS * DAY;
const WAD = 1e18;

// Tokenized RWA funds mark to a NAV oracle that steps once a day or slower, so
// a 24h window either catches a whole step or none of it. At 8-17x leverage a
// single caught step annualises into the hundreds of percent, and a missed one
// reports zero. A 7-day window spans several steps and gives a stable rate.
//
// Annualised growth above this band is treated as a sampling artefact (a fee
// accrual or rebalance landing inside the window) rather than a sustainable
// rate, and is dropped.
const MAX_PLAUSIBLE_APY = 100;

const EVENT_POSITION_MANAGER_CREATED =
  'event PositionManagerCreated(address indexed positionManager, address indexed owner, address indexed collateralAsset, address debtAsset, uint256 ltv, address transferGuard)';

const call = async (target, abi, block) =>
  (
    await sdk.api.abi.call({
      target,
      abi,
      chain: CHAIN,
      ...(block ? { block } : {}),
    })
  ).output;

const multiCall = async (calls, abi, block) =>
  (
    await sdk.api.abi.multiCall({
      calls: calls.map((target) => ({ target })),
      abi,
      chain: CHAIN,
      permitFailure: true,
      ...(block ? { block } : {}),
    })
  ).output;

const apy = async () => {
  // 1. Discover every leverage tier ever deployed, with its target LTV.
  const currentBlock = await sdk.api.util.getLatestBlock(CHAIN);
  const created = await sdk.getEventLogs({
    target: POSITION_MANAGER_FACTORY,
    eventAbi: EVENT_POSITION_MANAGER_CREATED,
    fromBlock: FACTORY_DEPLOY_BLOCK,
    toBlock: currentBlock.number,
    chain: CHAIN,
  });

  if (!created.length) return [];

  const managers = created.map((ev) => ({
    address: ev.args.positionManager,
    collateralAsset: ev.args.collateralAsset,
    debtAsset: ev.args.debtAsset,
    ltv: Number(ev.args.ltv) / WAD,
  }));
  const addresses = managers.map((m) => m.address);

  // 2. Current state.
  const [totalAssets, totalSupply] = await Promise.all([
    multiCall(addresses, 'uint256:totalAssets'),
    multiCall(addresses, 'uint256:totalSupply'),
  ]);

  // 3. Same state ~7 days ago, for realised share-price growth. If the archive read
  //    fails we fall back to no APY rather than failing the whole adapter.
  let priorAssets = [];
  let priorSupply = [];
  try {
    const now = Math.floor(Date.now() / 1e3);
    const blockPrior = (
      await utils.getBlocksByTime([now - LOOKBACK], CHAIN)
    )[0];
    [priorAssets, priorSupply] = await Promise.all([
      multiCall(addresses, 'uint256:totalAssets', blockPrior),
      multiCall(addresses, 'uint256:totalSupply', blockPrior),
    ]);
  } catch (e) {
    priorAssets = [];
    priorSupply = [];
  }

  // 4. Token metadata and pricing for the debt asset (the NAV denomination).
  const debtAssets = [
    ...new Set(managers.map((m) => m.debtAsset.toLowerCase())),
  ];
  const collateralAssets = [
    ...new Set(managers.map((m) => m.collateralAsset.toLowerCase())),
  ];

  const [debtDecimals, collateralSymbols] = await Promise.all([
    multiCall(debtAssets, 'uint8:decimals'),
    multiCall(collateralAssets, 'string:symbol'),
  ]);

  const decimalsByDebtAsset = Object.fromEntries(
    debtAssets.map((a, i) => [a, Number(debtDecimals[i]?.output)]),
  );
  const symbolByCollateral = Object.fromEntries(
    collateralAssets.map((a, i) => [a, collateralSymbols[i]?.output]),
  );

  const priceKeys = debtAssets.map((a) => `${CHAIN}:${a}`);
  const priceData = await utils.getPriceApiData(
    `/prices/current/${priceKeys.join(',')}`,
  );

  // 5. Build one pool per tier.
  const pools = managers
    .map((m, i) => {
      const assetsNow = Number(totalAssets[i]?.output);
      const supplyNow = Number(totalSupply[i]?.output);
      if (!Number.isFinite(assetsNow) || !Number.isFinite(supplyNow))
        return null;

      const debtAsset = m.debtAsset.toLowerCase();
      const decimals = decimalsByDebtAsset[debtAsset];
      const price = priceData?.coins?.[`${CHAIN}:${debtAsset}`]?.price;
      if (!Number.isFinite(decimals) || !Number.isFinite(price) || price <= 0) {
        return null;
      }

      const tvlUsd = (assetsNow / 10 ** decimals) * price;
      if (!Number.isFinite(tvlUsd) || tvlUsd < utils.MIN_TVL_USD) return null;

      // Realised APY from trailing 7-day share-price growth. Share price is
      // totalAssets/totalSupply; deposits and withdrawals are proportional and
      // so leave it unchanged, while fee shares dilute it — which is what we
      // want, since the published figure should be net of fees.
      let apyBase = 0;
      const assetsPrior = Number(priorAssets[i]?.output);
      const supplyPrior = Number(priorSupply[i]?.output);
      if (
        supplyNow > 0 &&
        supplyPrior > 0 &&
        Number.isFinite(assetsPrior) &&
        assetsPrior > 0
      ) {
        const ppsNow = assetsNow / supplyNow;
        const ppsPrior = assetsPrior / supplyPrior;
        const ratio = ppsNow / ppsPrior;
        if (Number.isFinite(ratio) && ratio > 0) {
          const annualised = (ratio ** (365 / LOOKBACK_DAYS) - 1) * 100;
          if (
            Number.isFinite(annualised) &&
            annualised > 0 &&
            annualised <= MAX_PLAUSIBLE_APY
          ) {
            apyBase = annualised;
          }
        }
      }

      const leverage = m.ltv > 0 && m.ltv < 1 ? 1 / (1 - m.ltv) : 1;
      const symbol = symbolByCollateral[m.collateralAsset.toLowerCase()];
      if (!symbol) return null;

      return {
        pool: `${m.address}-${CHAIN}`.toLowerCase(),
        chain: utils.formatChain(CHAIN),
        project: PROJECT,
        symbol: utils.formatSymbol(symbol),
        tvlUsd,
        apyBase,
        underlyingTokens: [m.collateralAsset],
        poolMeta: `${Math.round(leverage)}x leverage`,
        ltv: m.ltv,
        token: m.address,
        url: URL,
      };
    })
    .filter(Boolean);

  return pools;
};

module.exports = {
  timetravel: false,
  apy,
  url: URL,
  // DefiLlama protocol id for slug "3f" (defillama.com/protocol/3f,
  // TVL adapter projects/three-f/index.js).
  protocolId: '7923',
};
