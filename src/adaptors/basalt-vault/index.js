// Basalt Vault — delta-neutral GMX v2 GM (BTC/USD) yield on Arbitrum, hedged with a
// WBTC borrow on Dolomite. Users deposit the GM (WBTC-USDC) market token; each user
// owns an NFT-bound vault with an isolated Dolomite position (account 100).
//
// The whole strategy is ONE aggregate pool (not one per NFT vault):
//   tvlUsd  = net equity across all vaults (GM collateral - WBTC debt), priced by
//             Dolomite's on-chain oracles.
//   apyBase = live net APY built from the strategy's two legs, weighted by the
//             actual on-chain leverage:
//               + GM pool fee APR (trailing 7d realized fees per pool value, same
//                 GMX subgraph + math as the gmx-v2-perps adapter)
//               - Dolomite WBTC borrow APR (getMarketInterestRate, per-second rate)
//             minus Basalt's 20% HWM performance fee on profit => depositor-net.

const sdk = require('@defillama/sdk');
const { gql, request } = require('graphql-request');

const CHAIN = 'Arbitrum';
const FACTORY = '0x08e466fb09617d16ed27da9ea43ba601665f3b89'; // VaultCoreNftFactory
const DOLOMITE = '0x6Bd780E7fDf01D77e4d475c821f1e7AE05409072'; // DolomiteMargin
const GM_TOKEN = '0x47c031236e19d024b42f8AE6780E44A573170703'; // GMX v2 GM BTC/USD (WBTC-USDC)

const GM_MARKET = 32; // Dolomite market ids
const WBTC_MARKET = 4;
const ISO_ACCOUNT = 100; // isolated Dolomite sub-account used by every vault
const ZERO = '0x0000000000000000000000000000000000000000';
const SECONDS_IN_YEAR = 31_536_000;
const PERFORMANCE_FEE_BPS = 2000; // 20% HWM performance fee on profit (BasaltConstants.MANAGER_FEE_BPS)

const SUBGRAPH_URL =
  'https://gmx.squids.live/gmx-synthetics-arbitrum:prod/api/graphql';

const abis = {
  nextTokenId: 'uint256:nextTokenId',
  vaultByTokenId: 'function vaultByTokenId(uint256) view returns (address)',
  basaltState: 'function basaltState() view returns (address)',
  dolomiteIsolationVault:
    'function dolomiteIsolationVault() view returns (address)',
  getAccountWei:
    'function getAccountWei((address owner, uint256 number) account, uint256 market) view returns ((bool sign, uint256 value))',
  getMarketPrice:
    'function getMarketPrice(uint256 market) view returns ((uint256 value))',
  getMarketInterestRate:
    'function getMarketInterestRate(uint256 market) view returns ((uint256 value))',
};

const call = async (target, abi, params = []) =>
  (await sdk.api.abi.call({ target, abi, params, chain: 'arbitrum' })).output;

const multiCall = async (abi, calls) =>
  (await sdk.api.abi.multiCall({ abi, calls, chain: 'arbitrum' })).output.map(
    (r) => r.output
  );

// Trailing-7d realized GM fee APR (%) — same subgraph + convention as gmx-v2-perps
// (delta of cumulativeFeeUsdPerPoolValue x 52 / 1e28). Returns null when either
// series row is missing so the caller can skip publishing instead of guessing.
const gmFeeApr = async () => {
  const sevenDaysAgo = Math.floor(Date.now() / 1000) - 7 * 86400;
  const res = await request(
    SUBGRAPH_URL,
    gql`
      query F($market: String!, $ts: Int!) {
        start: collectedFeesInfos(
          orderBy: timestampGroup_DESC
          where: {
            address_containsInsensitive: $market
            period_eq: "1h"
            timestampGroup_lte: $ts
          }
          limit: 1
        ) {
          cumulativeFeeUsdPerPoolValue
        }
        recent: collectedFeesInfos(
          orderBy: timestampGroup_DESC
          where: { address_containsInsensitive: $market, period_eq: "1h" }
          limit: 1
        ) {
          cumulativeFeeUsdPerPoolValue
        }
      }
    `,
    { market: GM_TOKEN.toLowerCase(), ts: sevenDaysAgo }
  );
  const startRow = res.start?.[0];
  const recentRow = res.recent?.[0];
  if (!startRow || !recentRow) return null;
  const start = Number(startRow.cumulativeFeeUsdPerPoolValue);
  const recent = Number(recentRow.cumulativeFeeUsdPerPoolValue);
  // cumulative value is 1e30-scaled; delta * 52 / 1e28 => percent per year
  // (floor(365/7) like gmx-v2-perps — the minimum-attainable convention)
  return ((recent - start) * Math.floor(365 / 7)) / 1e28;
};

const apy = async () => {
  const n = Number(await call(FACTORY, abis.nextTokenId));
  if (!n) return [];

  const ids = Array.from({ length: n }, (_, i) => i + 1);
  const vaults = await multiCall(
    abis.vaultByTokenId,
    ids.map((id) => ({ target: FACTORY, params: [id] }))
  );
  const states = await multiCall(
    abis.basaltState,
    vaults.map((target) => ({ target }))
  );
  const isos = await multiCall(
    abis.dolomiteIsolationVault,
    states.map((target) => ({ target }))
  );

  // Only vaults that actually hold a Dolomite position.
  const live = isos.filter((iso) => iso && iso.toLowerCase() !== ZERO);
  if (!live.length) return [];

  const [gmWei, wbtcWei, gmPrice, wbtcPrice, borrowRate, gmApr] =
    await Promise.all([
      multiCall(
        abis.getAccountWei,
        live.map((iso) => ({
          target: DOLOMITE,
          params: [{ owner: iso, number: ISO_ACCOUNT }, GM_MARKET],
        }))
      ),
      multiCall(
        abis.getAccountWei,
        live.map((iso) => ({
          target: DOLOMITE,
          params: [{ owner: iso, number: ISO_ACCOUNT }, WBTC_MARKET],
        }))
      ),
      call(DOLOMITE, abis.getMarketPrice, [GM_MARKET]),
      call(DOLOMITE, abis.getMarketPrice, [WBTC_MARKET]),
      call(DOLOMITE, abis.getMarketInterestRate, [WBTC_MARKET]),
      gmFeeApr(),
    ]);

  // Dolomite prices are (36 - tokenDecimals)-scaled => wei * price = 36 decimals.
  const gmP = BigInt(gmPrice.value);
  const wbtcP = BigInt(wbtcPrice.value);

  let collateral36 = 0n; // GM collateral value
  let debt36 = 0n; // WBTC debt value
  let surplus36 = 0n; // positive WBTC balances (transient)
  for (let i = 0; i < live.length; i++) {
    const gm = gmWei[i];
    const wb = wbtcWei[i];
    if (gm.sign) collateral36 += BigInt(gm.value) * gmP;
    if (wb.sign) surplus36 += BigInt(wb.value) * wbtcP;
    else debt36 += BigInt(wb.value) * wbtcP;
  }

  const collateralUsd = Number(collateral36) / 1e36;
  const debtUsd = Number(debt36) / 1e36;
  const tvlUsd = collateralUsd + Number(surplus36) / 1e36 - debtUsd;
  if (tvlUsd <= 0) return [];

  // Skip publishing this hour when the fee series is unavailable — a 0 fee leg
  // would print a misleading borrow-only negative APY.
  if (gmApr == null) return [];

  // WBTC borrow APY (%) — per-second 1e18-scaled rate, compounded daily like
  // the dolomite adapter does.
  const borrowAprRaw = (Number(borrowRate.value) * SECONDS_IN_YEAR) / 1e18;
  const borrowApr = (Math.pow(1 + borrowAprRaw / 365, 365) - 1) * 100;

  // Net APY on equity: each leg weighted by its actual on-chain exposure,
  // then the performance fee taken off positive yield => what a depositor keeps.
  const grossApy =
    gmApr * (collateralUsd / tvlUsd) - borrowApr * (debtUsd / tvlUsd);
  const apyBase =
    grossApy > 0 ? grossApy * (1 - PERFORMANCE_FEE_BPS / 10_000) : grossApy;

  return [
    {
      pool: `${FACTORY}-arbitrum`,
      chain: CHAIN,
      project: 'basalt-vault',
      symbol: 'WBTC-USDC',
      // no single receipt token (vaults are NFT-bound clones) — explicit null so
      // the fallback regex doesn't pick the factory address out of the pool id
      token: null,
      tvlUsd,
      apyBase,
      underlyingTokens: [GM_TOKEN],
      poolMeta: 'Delta-neutral GM BTC/USD, WBTC-hedged on Dolomite',
    },
  ];
};

module.exports = {
  protocolId: '8191',
  timetravel: false,
  apy,
  url: 'https://btva.io',
};
