const sdk = require('@defillama/sdk');
const utils = require('../utils');

const PROJECT = 'flock-manager';
const CHAIN = 'robinhood';
const URL = 'https://www.ravenhood.xyz/flock-manager';

// Both factories enumerate their children, so markets and vaults are
// discovered rather than listed here. A new market needs no change.
const LEND_FACTORY = '0x8F50BCb1f34D22adAe05955E1994b0153603cB16';
const LENDING_VAULT_FACTORIES = [
  '0xf99414f768D97DfBc9304346517571c84898B28f',
  '0x002233F6488e41c52D1AbefD5c751410f65e1cb8',
];

// Superseded vault, drained and inert, but still enumerates from its factory.
// Excluded so it does not appear as a duplicate of the live USDG vault.
const RETIRED_VAULTS = ['0xeb5babd2843d22cffca80a28d4414feb2fdc6ae6'];

const SECONDS_PER_YEAR = 365 * 24 * 60 * 60;
const WAD = 1e18;

const abi = {
  allLendingPoolsLength: 'uint256:allLendingPoolsLength',
  allLendingPools: 'function allLendingPools(uint256) view returns (address)',
  getLendingPool:
    'function getLendingPool(address) view returns (bool initialized, uint24 lendingPoolId, address collateral, address borrowable0, address borrowable1)',
  allVaultsLength: 'uint256:allVaultsLength',
  allVaults: 'function allVaults(uint256) view returns (address)',
  underlying: 'address:underlying',
  symbol: 'string:symbol',
  decimals: 'uint8:decimals',
  totalBalance: 'uint256:totalBalance',
  totalBorrows: 'function totalBorrows() view returns (uint112)',
  totalSupply: 'uint256:totalSupply',
  exchangeRateLast: 'uint256:exchangeRateLast',
  borrowRate: 'uint256:borrowRate',
  reserveFactor: 'uint256:reserveFactor',
  safetyMarginSqrt: 'uint256:safetyMarginSqrt',
  liquidationIncentive: 'uint256:liquidationIncentive',
};

const call = (target, abiStr) =>
  sdk.api2.abi.call({ target, abi: abiStr, chain: CHAIN });
const multiCall = (calls, abiStr) =>
  sdk.api2.abi.multiCall({ calls, abi: abiStr, chain: CHAIN, permitFailure: true });

const num = (v) => Number(String(v ?? 0));
const units = (v, d) => num(v) / 10 ** d;

async function fetchList(target, lengthAbi, itemAbi) {
  const length = num(await call(target, lengthAbi));
  if (!length) return [];
  return multiCall(
    Array.from({ length }, (_, i) => ({ target, params: [i] })),
    itemAbi
  );
}

// Each Flock Lend market has one collateral and two borrowables, one per side
// of the pair. Every borrowable is its own lending market with its own rate,
// so each becomes a pool.
async function getLendingPools(prices) {
  const markets = await fetchList(
    LEND_FACTORY,
    abi.allLendingPoolsLength,
    abi.allLendingPools
  );
  if (!markets.length) return [];

  const poolData = await multiCall(
    markets.map((market) => ({ target: LEND_FACTORY, params: [market] })),
    abi.getLendingPool
  );

  const entries = [];
  poolData.forEach((pool, i) => {
    if (!pool || !pool.initialized) return;
    entries.push({ market: markets[i], collateral: pool.collateral, borrowable: pool.borrowable0 });
    entries.push({ market: markets[i], collateral: pool.collateral, borrowable: pool.borrowable1 });
  });
  if (!entries.length) return [];

  const borrowables = entries.map(({ borrowable }) => borrowable);
  const collaterals = [...new Set(entries.map(({ collateral }) => collateral))];

  const [tokens, cash, borrows, rates, reserveFactors] = await Promise.all([
    multiCall(borrowables, abi.underlying),
    multiCall(borrowables, abi.totalBalance),
    multiCall(borrowables, abi.totalBorrows),
    multiCall(borrowables, abi.borrowRate),
    multiCall(borrowables, abi.reserveFactor),
  ]);
  // Read decimals from the UNDERLYING, never the pool token. Balances here
  // are denominated in the underlying, while a pool token's own decimals are
  // its share decimals, which are 18 even against 6-decimal USDG. Taking the
  // pool token's value priced USDG a trillion times too low.
  const decimals = await multiCall(tokens.map((t) => t || LEND_FACTORY), abi.decimals);
  const [safetyMargins, liquidationIncentives] = await Promise.all([
    multiCall(collaterals, abi.safetyMarginSqrt),
    multiCall(collaterals, abi.liquidationIncentive),
  ]);
  const symbols = await multiCall(tokens.filter(Boolean), abi.symbol);
  const symbolByToken = {};
  tokens.filter(Boolean).forEach((token, i) => {
    symbolByToken[token.toLowerCase()] = symbols[i];
  });

  // Borrowing one asset against LP collateral needs
  // debt * safetyMarginSqrt * liquidationIncentive of collateral value, so
  // the most that can be drawn is the inverse. Read per market rather than
  // hardcoded: both are governance-settable within bounds.
  const ltvByCollateral = {};
  collaterals.forEach((collateral, i) => {
    const sm = num(safetyMargins[i]) / WAD;
    const li = num(liquidationIncentives[i]) / WAD;
    ltvByCollateral[collateral.toLowerCase()] = sm > 0 && li > 0 ? 1 / (sm * li) : 0;
  });

  return entries
    .map((entry, i) => {
      const token = tokens[i];
      if (!token) return null;
      const d = num(decimals[i]) || 18;
      const price = prices[token.toLowerCase()];
      if (price === undefined) return null;

      const supplyTokens = units(cash[i], d) + units(borrows[i], d);
      const borrowTokens = units(borrows[i], d);
      const totalSupplyUsd = supplyTokens * price;
      const totalBorrowUsd = borrowTokens * price;
      const utilization = supplyTokens > 0 ? borrowTokens / supplyTokens : 0;

      // borrowRate is per second, scaled 1e18. Suppliers receive it on the
      // borrowed share only, less the protocol's reserve cut.
      const apyBaseBorrow = (num(rates[i]) / WAD) * SECONDS_PER_YEAR * 100;
      const apyBase =
        apyBaseBorrow * utilization * (1 - num(reserveFactors[i]) / WAD);

      return {
        pool: `${entry.borrowable}-${CHAIN}`.toLowerCase(),
        chain: utils.formatChain(CHAIN),
        project: PROJECT,
        symbol: utils.formatSymbol(symbolByToken[token.toLowerCase()] ?? '?'),
        tvlUsd: totalSupplyUsd - totalBorrowUsd,
        apyBase,
        apyBaseBorrow,
        totalSupplyUsd,
        totalBorrowUsd,
        ltv: ltvByCollateral[entry.collateral.toLowerCase()] ?? 0,
        underlyingTokens: [token],
        poolMeta: 'Flock Lend',
        url: URL,
      };
    })
    .filter(Boolean);
}

// The lending vaults sit on top of the pools above, routing a single deposit
// to whichever of them pays best. Listed separately because they are their
// own deposit product, the way an aggregator vault is listed over the pools
// it allocates into.
async function getLendingVaults(prices) {
  const vaults = (
    await Promise.all(
      LENDING_VAULT_FACTORIES.map((factory) =>
        fetchList(factory, abi.allVaultsLength, abi.allVaults)
      )
    )
  )
    .flat()
    .filter((vault) => !RETIRED_VAULTS.includes(vault.toLowerCase()));
  if (!vaults.length) return [];

  const [tokens, supplies, exchangeRates, symbols] = await Promise.all([
    multiCall(vaults, abi.underlying),
    multiCall(vaults, abi.totalSupply),
    multiCall(vaults, abi.exchangeRateLast),
    multiCall(vaults, abi.symbol),
  ]);
  // Same reason as above: a vault's own decimals are its share decimals, so
  // the amount has to be derived from the underlying's.
  const decimals = await multiCall(tokens.map((t) => t || LEND_FACTORY), abi.decimals);
  const underlyingSymbols = await multiCall(tokens.filter(Boolean), abi.symbol);
  const symbolByToken = {};
  tokens.filter(Boolean).forEach((token, i) => {
    symbolByToken[token.toLowerCase()] = underlyingSymbols[i];
  });

  return vaults
    .map((vault, i) => {
      const token = tokens[i];
      if (!token) return null;
      const price = prices[token.toLowerCase()];
      if (price === undefined) return null;

      const d = num(decimals[i]) || 18;
      const sharePrice = num(exchangeRates[i]) / WAD;
      const tvlUsd = units(supplies[i], d) * sharePrice * price;

      // No apyBase: the vault's yield is whatever its allocation earns, which
      // moves every block and cannot be read as a rate from the contract.
      // Reporting a number derived from the current split would be a snapshot
      // dressed up as a rate, so it is left out until there is share price
      // history to annualise.
      return {
        pool: `${vault}-${CHAIN}`.toLowerCase(),
        chain: utils.formatChain(CHAIN),
        project: PROJECT,
        symbol: utils.formatSymbol(symbolByToken[token.toLowerCase()] ?? '?'),
        tvlUsd,
        apyBase: 0,
        pricePerShare: sharePrice,
        underlyingTokens: [token],
        token: vault,
        poolMeta: `${symbols[i] ?? 'Lending'} vault`,
        url: `${URL}/vaults`,
      };
    })
    .filter(Boolean);
}

const apy = async () => {
  // One price lookup for every underlying either side needs.
  const markets = await fetchList(
    LEND_FACTORY,
    abi.allLendingPoolsLength,
    abi.allLendingPools
  );
  const poolData = markets.length
    ? await multiCall(
        markets.map((market) => ({ target: LEND_FACTORY, params: [market] })),
        abi.getLendingPool
      )
    : [];
  const borrowables = [];
  poolData.forEach((pool) => {
    if (pool && pool.initialized) borrowables.push(pool.borrowable0, pool.borrowable1);
  });
  const vaults = (
    await Promise.all(
      LENDING_VAULT_FACTORIES.map((factory) =>
        fetchList(factory, abi.allVaultsLength, abi.allVaults)
      )
    )
  ).flat();

  const underlyings = await multiCall([...borrowables, ...vaults], abi.underlying);
  const unique = [...new Set(underlyings.filter(Boolean).map((t) => t.toLowerCase()))];
  const { pricesByAddress } = await utils.getPrices(unique, CHAIN);

  const [lendingPools, lendingVaults] = await Promise.all([
    getLendingPools(pricesByAddress),
    getLendingVaults(pricesByAddress),
  ]);

  // Drop empty pools. The first USDG vault was superseded by a redeploy and
  // still enumerates from its factory, so without this it would appear as a
  // permanently empty duplicate of the live one.
  return [...lendingPools, ...lendingVaults].filter((pool) => pool.tvlUsd > 0);
};

module.exports = {
  timetravel: false,
  apy,
  url: URL,
};
