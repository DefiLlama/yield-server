const sdk = require('@defillama/sdk');
const utils = require('../utils');

// Stock Yield by HedgeHood: weekly covered-call vaults (BrokerEpochVault) on Robinhood Chain stock tokens.
// Depositors' stock backs one call a week; the premium, net of the desk fee, is paid to them in USDG.
const CHAIN = 'robinhood';
const USDG = '0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168';
const VAULTS = [
  {
    vault: '0xe35B7D7bf1212b89478ddAba2946ADEd59BEC0a9', // hNVDA
    symbol: 'NVDA',
    poolMeta: 'NVDA Printer, weekly covered call paid in USDG',
    url: 'https://hedgehood.app/stockyield/nvda-printer',
  },
];
// The most recent settled epochs, as a simple annual rate over the time they span: rewards are paid out in USDG and
// only compound if a depositor opts into reinvesting them.
const EPOCHS = 4;
const WEEK = 7 * 86400;
const YEAR = 365 * 86400;
// A vault that has not settled an epoch for this long is not earning now: leave it out
const STALE_AFTER = 10 * 86400;

const EPOCH =
  'tuple(uint64 lockedAt,uint64 expiry,uint64 settledAt,uint256 stockAtLock,uint256 sharesAtLock,uint256 maxCoveredStock,uint256 strike,uint256 minPremium,uint256 stockMultiplier,bytes32 instructionHash,bytes32 executionHash,uint256 filledStock,uint256 grossPremium,int256 netPnl,uint256 stockDebit,uint256 debitPrice,bytes32 settlementHash,uint64 frozenAt,uint256 feePaid,int256 userNetPnl,uint64 executedAt,uint256 lossCoverage,bytes32 historyContextHash)';
const ABI = {
  stock: 'address:stock',
  currentEpoch: 'uint256:currentEpoch',
  managedBalances:
    'function managedBalances() view returns (uint256 stockAmount, uint256 usdgAmount)',
  getEpoch: `function getEpoch(uint256) view returns (${EPOCH})`,
};

// One settled epoch's result for depositors, as a fraction of the vault's stock at lock valued at the strike (a
// slightly conservative base: the strike is above the price when the call is sold). An epoch with no call sold earns 0.
function epochReturn(e) {
  const base = (BigInt(e.stockAtLock) * BigInt(e.strike)) / 10n ** 30n; // USDG, 6 decimals
  if (base === 0n) return 0;
  return Number(BigInt(e.userNetPnl)) / Number(base);
}

const apy = async () => {
  const api = new sdk.ChainApi({ chain: CHAIN });
  const vaults = VAULTS.map((v) => v.vault);
  const [stocks, balances, currentEpochs] = await Promise.all([
    api.multiCall({ abi: ABI.stock, calls: vaults }),
    api.multiCall({ abi: ABI.managedBalances, calls: vaults }),
    api.multiCall({ abi: ABI.currentEpoch, calls: vaults }),
  ]);
  const { pricesByAddress } = await utils.getPrices([...stocks, USDG], CHAIN);

  const pools = await Promise.all(
    VAULTS.map(async ({ vault, symbol, poolMeta, url }, i) => {
      const stock = stocks[i];
      const stockPrice = pricesByAddress[stock.toLowerCase()];
      const usdgPrice = pricesByAddress[USDG.toLowerCase()];
      const tvlUsd =
        (Number(balances[i].stockAmount) / 1e18) * stockPrice +
        (Number(balances[i].usdgAmount) / 1e6) * usdgPrice;

      // The vault advances currentEpoch when an epoch settles, so every earlier epoch is settled. Read one more than
      // is counted: its settlement is where the counted period starts.
      const current = Number(currentEpochs[i]);
      const ids = [];
      for (let id = current - 1; id >= 1 && ids.length <= EPOCHS; id--)
        ids.push(id);
      const epochs = ids.length
        ? await api.multiCall({ abi: ABI.getEpoch, target: vault, calls: ids })
        : [];
      const counted = epochs.slice(0, EPOCHS);
      if (!counted.length) return null; // no settled epoch yet: no yield to report, not 0
      const latestSettledAt = Number(counted[0].settledAt);
      if (Date.now() / 1000 - latestSettledAt > STALE_AFTER) return null;

      // From the settlement before the oldest counted epoch (or, for the first epoch, its freeze), and at least a week
      // per epoch: between epochs, capital waits in the vault for the next cutoff.
      const oldest = counted[counted.length - 1];
      const start = epochs[EPOCHS]
        ? Number(epochs[EPOCHS].settledAt)
        : Number(oldest.frozenAt) || latestSettledAt;
      const span = Math.max(latestSettledAt - start, counted.length * WEEK);
      const returns = counted.map(epochReturn);
      const apyBase = (returns.reduce((a, b) => a + b, 0) * YEAR * 100) / span;

      return {
        pool: `${vault}-${CHAIN}`.toLowerCase(),
        chain: utils.formatChain(CHAIN),
        project: 'hedgehood-stock-yield',
        symbol,
        tvlUsd,
        apyBase,
        // the latest epoch, when the call's payout exceeded the premium
        il7d: returns[0] < 0 ? returns[0] * 100 : null,
        underlyingTokens: [stock],
        token: vault,
        poolMeta,
        url,
      };
    })
  );
  return pools.filter(Boolean);
};

module.exports = {
  protocolId: 'TODO', // assigned when the TVL listing (DefiLlama-Adapters) is published
  timetravel: false,
  apy,
  url: 'https://hedgehood.app/stockyield',
};
