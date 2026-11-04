const sdk = require('@defillama/sdk');
const utils = require('../utils');

// Stock Yield by HedgeHood: weekly option-writing vaults on Robinhood Chain stock tokens.
// v1 (BrokerEpochVault): depositors' stock backs one call a week; the premium, net of the desk fee, is paid to them in
// USDG. v2 (EpochFund, every fund listed in a VaultRegistry): covered call, wheel, ...; each epoch's premium, net of the
// fee, is added to the fund's NAV and in-the-money payouts are deducted from it.
const CHAIN = 'robinhood';
const USDG = '0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168';
const V1_VAULTS = [
  {
    vault: '0xe35B7D7bf1212b89478ddAba2946ADEd59BEC0a9', // hNVDA
    symbol: 'NVDA',
    poolMeta: 'NVDA Printer, weekly covered call paid in USDG',
    url: 'https://hedgehood.app/stockyield/nvda-printer',
  },
];
const V2_REGISTRY = '0x868502F926AE068B61EA9CC55042A9F962651e76';
// The most recent settled epochs that held assets, as a simple annual rate over the time they span: v1 rewards are
// paid out in USDG and only compound if a depositor opts into reinvesting them.
const EPOCHS = 4;
const WEEK = 7 * 86400;
const YEAR = 365 * 86400;
// A vault that has not settled an epoch for this long is not earning now: leave it out
const STALE_AFTER = 10 * 86400;
const VALUE_SCALE = 10n ** 30n; // 18d stock * 18d price => 6d USDG

const V1_EPOCH =
  'tuple(uint64 lockedAt,uint64 expiry,uint64 settledAt,uint256 stockAtLock,uint256 sharesAtLock,uint256 maxCoveredStock,uint256 strike,uint256 minPremium,uint256 stockMultiplier,bytes32 instructionHash,bytes32 executionHash,uint256 filledStock,uint256 grossPremium,int256 netPnl,uint256 stockDebit,uint256 debitPrice,bytes32 settlementHash,uint64 frozenAt,uint256 feePaid,int256 userNetPnl,uint64 executedAt,uint256 lossCoverage,bytes32 historyContextHash)';
const V2_EPOCH =
  'tuple(uint64 frozenAt,uint64 settledAt,bool depositsRefunded,uint256 navPrice,uint256 navUsdg,uint256 depositStock,uint256 depositUsdg,uint256 depositShares,uint256 redeemShares,uint256 redeemStock,uint256 redeemUsdg,uint256 depositStockLeft,uint256 depositUsdgLeft,uint256 depositSharesLeft,uint256 redeemSharesLeft,uint256 redeemStockLeft,uint256 redeemUsdgLeft,uint256 settlementPrice,uint256 paidStock,uint256 paidUsdg,uint256 fee,uint256 income)';
const ABI = {
  stock: 'address:stock',
  usdg: 'address:usdg',
  currentEpoch: 'uint256:currentEpoch',
  managedBalances:
    'function managedBalances() view returns (uint256 stockAmount, uint256 usdgAmount)',
  v1GetEpoch: `function getEpoch(uint256) view returns (${V1_EPOCH})`,
  v2GetEpoch: `function getEpoch(uint256) view returns (${V2_EPOCH})`,
};

// v1: depositors' net result over the vault's stock at lock valued at the strike (a slightly conservative base: the
// strike is above the price when the call is sold). An epoch with no call sold earns 0. Amounts in USDG, 6 decimals.
function v1EpochResult(e) {
  const base = (BigInt(e.stockAtLock) * BigInt(e.strike)) / VALUE_SCALE;
  return { base, net: BigInt(e.userNetPnl) };
}

// v2: the premium that entered NAV less what the buyers were paid (stock valued at the settlement price), over NAV
// once the epoch's redemptions had left and its deposits joined.
function v2EpochResult(e) {
  const deposits = e.depositsRefunded
    ? 0n
    : (BigInt(e.depositStock) * BigInt(e.navPrice)) / VALUE_SCALE +
      BigInt(e.depositUsdg);
  const paid =
    (BigInt(e.paidStock) * BigInt(e.settlementPrice)) / VALUE_SCALE +
    BigInt(e.paidUsdg);
  return { base: BigInt(e.navUsdg) + deposits, net: BigInt(e.income) - paid };
}

// A vault advances currentEpoch when an epoch settles, so every earlier epoch is settled. Newest first, and one more
// than is counted: its settlement is where the counted period starts.
async function settledEpochs(api, vault, abi, currentEpoch) {
  const ids = [];
  for (let id = Number(currentEpoch) - 1; id >= 1 && ids.length <= EPOCHS; id--)
    ids.push(id);
  return ids.length ? api.multiCall({ abi, target: vault, calls: ids }) : [];
}

// apyBase and il7d from settled epochs (newest first), or null when the vault is not earning
function annualize(epochs, result) {
  // Stop at the first epoch that held nothing: before its first deposit a vault was not earning
  const live = [];
  for (const e of epochs) {
    const { base, net } = result(e);
    if (base === 0n) break;
    live.push({ e, r: Number(net) / Number(base) });
  }
  const counted = live.slice(0, EPOCHS);
  if (!counted.length) return null; // no settled epoch yet: no yield to report, not 0
  const latestSettledAt = Number(counted[0].e.settledAt);
  if (Date.now() / 1000 - latestSettledAt > STALE_AFTER) return null;

  // From the settlement before the oldest counted epoch (or, for the first epoch, its freeze), and at least a week
  // per epoch: between epochs, capital waits in the vault for the next cutoff.
  const oldest = counted[counted.length - 1].e;
  const start = live[EPOCHS]
    ? Number(live[EPOCHS].e.settledAt)
    : Number(oldest.frozenAt) || latestSettledAt;
  const span = Math.max(latestSettledAt - start, counted.length * WEEK);
  const sum = counted.reduce((a, { r }) => a + r, 0);
  return {
    apyBase: (sum * YEAR * 100) / span,
    // the latest epoch, when the payout exceeded the premium
    il7d: counted[0].r < 0 ? counted[0].r * 100 : null,
  };
}

const pool = (vault, fields) => ({
  pool: `${vault}-${CHAIN}`.toLowerCase(),
  chain: utils.formatChain(CHAIN),
  project: 'hedgehood-stock-yield',
  token: vault,
  ...fields,
});

async function v1Pools(api) {
  const vaults = V1_VAULTS.map((v) => v.vault);
  const [stocks, balances, currentEpochs] = await Promise.all([
    api.multiCall({ abi: ABI.stock, calls: vaults }),
    api.multiCall({ abi: ABI.managedBalances, calls: vaults }),
    api.multiCall({ abi: ABI.currentEpoch, calls: vaults }),
  ]);
  const { pricesByAddress } = await utils.getPrices([...stocks, USDG], CHAIN);

  return Promise.all(
    V1_VAULTS.map(async ({ vault, symbol, poolMeta, url }, i) => {
      const stock = stocks[i];
      // depositor stock (active, queued, redeemed but unclaimed) and earned, unclaimed USDG premiums
      const tvlUsd =
        (Number(balances[i].stockAmount) / 1e18) *
          pricesByAddress[stock.toLowerCase()] +
        (Number(balances[i].usdgAmount) / 1e6) *
          pricesByAddress[USDG.toLowerCase()];
      const epochs = await settledEpochs(
        api,
        vault,
        ABI.v1GetEpoch,
        currentEpochs[i]
      );
      const yields = annualize(epochs, v1EpochResult);
      if (!yields || !Number.isFinite(tvlUsd)) return null;
      return pool(vault, {
        symbol,
        tvlUsd,
        ...yields,
        underlyingTokens: [stock],
        poolMeta,
        url,
      });
    })
  );
}

async function v2Pools(api) {
  const funds = await api.call({
    abi: 'address[]:vaults',
    target: V2_REGISTRY,
  });
  if (!funds.length) return [];
  const uints = (fields) =>
    Promise.all(
      fields.map((f) => api.multiCall({ abi: `uint256:${f}`, calls: funds }))
    );
  const [stocks, usdgs, names, currentEpochs, stockParts, usdgParts] =
    await Promise.all([
      api.multiCall({ abi: ABI.stock, calls: funds }),
      api.multiCall({ abi: ABI.usdg, calls: funds }),
      api.multiCall({ abi: 'string:name', calls: funds }),
      api.multiCall({ abi: ABI.currentEpoch, calls: funds }),
      uints(['stockHeld', 'pendingStock', 'reservedStock']),
      uints(['usdgHeld', 'pendingUsdg', 'reservedUsdg']),
    ]);
  const [symbols, { pricesByAddress }] = await Promise.all([
    api.multiCall({ abi: 'erc20:symbol', calls: stocks }),
    utils.getPrices([...new Set([...stocks, ...usdgs])], CHAIN),
  ]);

  return Promise.all(
    funds.map(async (fund, i) => {
      // As the TVL adapter counts them: NAV (stockHeld/usdgHeld, including collateral locked as option cover), queued
      // deposits, and redeemed or refunded assets not yet claimed. The buyers' escrowed premium joins NAV at settlement.
      const stockAmount = stockParts.reduce((a, p) => a + Number(p[i]), 0);
      const usdgAmount = usdgParts.reduce((a, p) => a + Number(p[i]), 0);
      const tvlUsd =
        (stockAmount / 1e18) * pricesByAddress[stocks[i].toLowerCase()] +
        (usdgAmount / 1e6) * pricesByAddress[usdgs[i].toLowerCase()];
      const epochs = await settledEpochs(
        api,
        fund,
        ABI.v2GetEpoch,
        currentEpochs[i]
      );
      const yields = annualize(epochs, v2EpochResult);
      if (!yields || !Number.isFinite(tvlUsd)) return null;
      return pool(fund, {
        symbol: symbols[i],
        tvlUsd,
        ...yields,
        underlyingTokens: [stocks[i], usdgs[i]],
        poolMeta: `${names[i]}, weekly, premium added to NAV`,
        url: `https://hedgehood.app/stockyield/fund/${fund}`,
      });
    })
  );
}

const apy = async () => {
  const api = new sdk.ChainApi({ chain: CHAIN });
  const pools = await Promise.all([v1Pools(api), v2Pools(api)]);
  return pools.flat().filter(Boolean);
};

module.exports = {
  protocolId: '9100', // https://api.llama.fi/protocols, slug hedgehood-stock-yield
  timetravel: false,
  apy,
  url: 'https://hedgehood.app/stockyield',
};
