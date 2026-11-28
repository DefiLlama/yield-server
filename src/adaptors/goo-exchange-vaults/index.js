const sdk = require('@defillama/sdk');
const utils = require('../utils');

const PROJECT = 'goo-exchange-vaults';
const CHAIN = 'robinhood';
const URL = 'https://goo.exchange/vaults';

// SatelliteVaultFactory: the protocol creates each curated vault; anyone deposits. Each vault is the only liquidity
// provider of its own 0%-fee pool, which only the protocol's arbitrage executor can swap, and every profit that
// executor makes through the pool is paid to the vault's own SatelliteProfitSplitter.
const VAULT_FACTORY = '0xB4FE65D4A7Fa5Fe40A58e78eF3B5eE34a0059643';
// The factory's deployment block (2026-10-19 20:46 UTC): no vault and no profit exist before it.
const FROM_BLOCK = 92908219;

// A vault's splitter sends 25% of each profit to the protocol (fee jar and dev fund) and the rest, toCompounder, to the
// vault, whose compound() adds it to the position: toCompounder is what depositors earn.
const DISTRIBUTED =
  'event Distributed(address indexed token, uint256 toJar, uint256 toDevFund, uint256 toCompounder)';
// A vault younger than the APR window is measured over its own life.
const VAULT_CREATED =
  'event VaultCreated(address indexed vault, address indexed pool, address indexed creator, address token0, address token1, address base, int24 tickLower, int24 tickUpper, address splitter)';

// The first deposit locks this many shares at a dead address, so a vault with no more has no depositors.
const MIN_SHARES = 1000n;
const DAY = 86400;
// apyBase is what depositors were paid over the last day, annualised; apyBase7d the same over the last WINDOW_DAYS
// days, as goo.exchange/vaults shows it.
const WINDOW_DAYS = 7;
const MIN_PRICE_CONFIDENCE = 0.9;

const abi = {
  vaultCount: 'function vaultCount() view returns (uint256)',
  vaultAt: 'function vaultAt(uint256) view returns (address)',
  token0: 'address:token0',
  token1: 'address:token1',
  splitter: 'address:splitter',
  totals: 'function totals() view returns (uint256 total0, uint256 total1)',
  totalSupply: 'uint256:totalSupply',
};

const call = (calls, method) =>
  sdk.api2.abi.multiCall({
    abi: abi[method] || method,
    calls,
    chain: CHAIN,
    permitFailure: true,
  });

const apy = async () => {
  const count = Number(
    await sdk.api2.abi.call({
      target: VAULT_FACTORY,
      abi: abi.vaultCount,
      chain: CHAIN,
    })
  );
  const vaults = (
    await call(
      [...Array(count).keys()].map((i) => ({
        target: VAULT_FACTORY,
        params: [i],
      })),
      'vaultAt'
    )
  ).filter(Boolean);

  // A vault's token can be anything, hostile included: a read that fails drops only its own vault.
  const [token0s, token1s, splitters, totals, supplies] = await Promise.all(
    ['token0', 'token1', 'splitter', 'totals', 'totalSupply'].map((m) =>
      call(vaults, m)
    )
  );

  const live = vaults
    .map((vault, i) => ({
      vault: vault.toLowerCase(),
      token0: token0s[i]?.toLowerCase(),
      token1: token1s[i]?.toLowerCase(),
      splitter: splitters[i]?.toLowerCase(),
      total0: totals[i] && BigInt(totals[i].total0 ?? totals[i][0]),
      total1: totals[i] && BigInt(totals[i].total1 ?? totals[i][1]),
      supply: supplies[i] == null ? null : BigInt(supplies[i]),
    }))
    .filter(
      (v) =>
        v.token0 &&
        v.token1 &&
        v.splitter &&
        v.total0 != null &&
        v.supply > MIN_SHARES
    );
  if (!live.length) return [];

  const tokens = [...new Set(live.flatMap((v) => [v.token0, v.token1]))];
  const [symbols, decimals, prices] = await Promise.all([
    call(tokens, 'erc20:symbol'),
    call(tokens, 'erc20:decimals'),
    utils.getPriceApiCoins(tokens.map((t) => `${CHAIN}:${t}`)),
  ]);
  const meta = {};
  tokens.forEach((t, i) => {
    const price = prices[`${CHAIN}:${t}`];
    meta[t] = {
      symbol: symbols[i],
      decimals: decimals[i] == null ? null : Number(decimals[i]),
      price: price?.confidence >= MIN_PRICE_CONFIDENCE ? price.price : null,
    };
  });

  // A vault is listed only when both its tokens are priced: half a TVL with the profit in the priced token would
  // overstate the yield.
  const priced = live.filter((v) =>
    [v.token0, v.token1].every(
      (t) => meta[t].symbol && meta[t].decimals != null && meta[t].price > 0
    )
  );
  if (!priced.length) return [];

  // The depositors' part of the profit over the last day and the last WINDOW_DAYS days; the window opens at the
  // factory's deployment at most.
  const now = Math.floor(Date.now() / 1000);
  const [[windowStart, dayStart], latest] = await Promise.all([
    utils.getBlocksByTime([now - WINDOW_DAYS * DAY, now - DAY], CHAIN),
    sdk.api.util.getLatestBlock(CHAIN),
  ]);
  const fromBlock = Math.max(windowStart, FROM_BLOCK);
  const range = { chain: CHAIN, fromBlock, toBlock: latest.number };
  const [logs, created] = await Promise.all([
    sdk.getEventLogs({
      ...range,
      targets: priced.map((v) => v.splitter),
      eventAbi: DISTRIBUTED,
      flatten: false,
    }),
    sdk.getEventLogs({ ...range, target: VAULT_FACTORY, eventAbi: VAULT_CREATED }),
  ]);
  // per vault and token: [paid over the window, paid over the last day]
  const earned = {};
  priced.forEach((v, i) =>
    logs[i].forEach((log) => {
      const key = `${v.vault}-${log.args.token.toLowerCase()}`;
      const amount = BigInt(log.args.toCompounder);
      const [week, day] = earned[key] ?? [0n, 0n];
      earned[key] = [week + amount, log.blockNumber >= dayStart ? day + amount : day];
    })
  );
  // A vault younger than the window is annualised over its own life, never less than a day, as the site does; its
  // age comes from its creation block at the window's block rate.
  const createdAt = {};
  created.forEach((log) => {
    createdAt[log.args.vault.toLowerCase()] = Number(log.blockNumber);
  });
  const blocksPerDay = (latest.number - windowStart) / WINDOW_DAYS;
  const windowDays = (vault) =>
    Math.max(
      1,
      Math.min(
        WINDOW_DAYS,
        (latest.number - Math.max(createdAt[vault] ?? windowStart, windowStart)) /
          blocksPerDay
      )
    );

  const usd = (token, raw) =>
    (Number(raw) / 10 ** meta[token].decimals) * meta[token].price;

  return priced
    .map((v) => {
      const tvlUsd = usd(v.token0, v.total0) + usd(v.token1, v.total1);
      // only the vault's own two tokens: anything else sent to its splitter never reaches the position
      const earnedUsd = (window) =>
        [v.token0, v.token1].reduce(
          (sum, t) => sum + usd(t, (earned[`${v.vault}-${t}`] ?? [0n, 0n])[window]),
          0
        );
      // the realised APR, as goo.exchange/vaults shows it; compounding is not added on top
      const apr = (window, days) =>
        tvlUsd > 0 ? ((earnedUsd(window) * 365) / days / tvlUsd) * 100 : 0;
      return {
        pool: `${v.vault}-${CHAIN}`,
        chain: utils.formatChain(CHAIN),
        project: PROJECT,
        symbol: `${meta[v.token0].symbol}-${meta[v.token1].symbol}`,
        tvlUsd,
        apyBase: apr(1, 1),
        apyBase7d: apr(0, windowDays(v.vault)),
        underlyingTokens: [v.token0, v.token1],
        token: v.vault,
        poolMeta: 'Auto-compounding arbitrage vault',
        url: URL,
      };
    })
    .filter(utils.keepFinite);
};

module.exports = {
  protocolId: '9183',
  timetravel: false,
  apy,
  url: URL,
};
