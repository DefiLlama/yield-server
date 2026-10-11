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
// Average over the most recent settled weeks, as a simple annual rate: rewards are paid out in USDG and only
// compound if a depositor opts into reinvesting them.
const WEEKS = 4;
const WEEKS_PER_YEAR = 52;

const EPOCH =
  'tuple(uint64 lockedAt,uint64 expiry,uint64 settledAt,uint256 stockAtLock,uint256 sharesAtLock,uint256 maxCoveredStock,uint256 strike,uint256 minPremium,uint256 stockMultiplier,bytes32 instructionHash,bytes32 executionHash,uint256 filledStock,uint256 grossPremium,int256 netPnl,uint256 stockDebit,uint256 debitPrice,bytes32 settlementHash,uint64 frozenAt,uint256 feePaid,int256 userNetPnl,uint64 executedAt,uint256 lossCoverage,bytes32 historyContextHash)';
const ABI = {
  stock: 'address:stock',
  currentEpoch: 'uint256:currentEpoch',
  managedBalances: 'function managedBalances() view returns (uint256 stockAmount, uint256 usdgAmount)',
  getEpoch: `function getEpoch(uint256) view returns (${EPOCH})`,
};

// One settled week's result for depositors, as a fraction of the covered stock valued at the strike (a slightly
// conservative base: the strike is above the price when the call is sold). A week with no call sold earns 0.
function weeklyReturn(e) {
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

      // The vault advances currentEpoch when an epoch settles, so every earlier epoch is settled.
      const current = Number(currentEpochs[i]);
      const settled = [];
      for (let id = current - 1; id >= 1 && settled.length < WEEKS; id--) settled.push(id);
      const epochs = settled.length
        ? await api.multiCall({ abi: ABI.getEpoch, target: vault, calls: settled })
        : [];
      const returns = epochs.map(weeklyReturn);
      const apyBase = returns.length
        ? (returns.reduce((a, b) => a + b, 0) / returns.length) * WEEKS_PER_YEAR * 100
        : null;

      return {
        pool: `${vault}-${CHAIN}`.toLowerCase(),
        chain: utils.formatChain(CHAIN),
        project: 'hedgehood-stock-yield',
        symbol,
        tvlUsd,
        apyBase,
        // the latest week, when the call's payout exceeded the premium
        il7d: returns.length && returns[0] < 0 ? returns[0] * 100 : null,
        underlyingTokens: [stock],
        token: vault,
        poolMeta,
        url,
      };
    })
  );
  // A vault with no settled week has no yield to report yet: leave it out rather than show 0
  return pools.filter((p) => p.apyBase !== null);
};

module.exports = {
  protocolId: 'TODO', // assigned when the TVL listing (DefiLlama-Adapters) is published
  timetravel: false,
  apy,
  url: 'https://hedgehood.app/stockyield',
};
