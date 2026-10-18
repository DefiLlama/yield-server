const sdk = require('@defillama/sdk');
const { chunk } = require('lodash');
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

// Distributed(address indexed token, uint256 toJar, uint256 toDevFund, uint256 toCompounder). A vault's splitter sends
// 25% of each profit to the protocol (fee jar and dev fund) and the rest, toCompounder, to the vault, whose compound()
// adds it to the position: toCompounder is what depositors earn.
const DISTRIBUTED =
  '0xf334dc3327c53a5f7fd39f983cbad4306ff127f0ecdadf23c6f361eca5358c32';
// VaultCreated(address indexed vault, address indexed pool, address indexed creator, ...): a vault younger than the
// APR window is measured over its own life.
const VAULT_CREATED =
  '0xf8192feb38b4f4c0254653081493669f6b7e0b4159166a531ffbe2db6a1ea4b7';

// The first deposit locks this many shares at a dead address, so a vault with no more has no depositors.
const MIN_SHARES = 1000n;
const DAY = 86400;
// The APR is what depositors were paid over the last WINDOW_DAYS days, annualised, as goo.exchange/vaults shows it.
const WINDOW_DAYS = 7;
// The public Robinhood RPC refuses eth_getLogs over 100k blocks (the chain makes about 850k a day).
const LOG_BLOCK_RANGE = 50_000;
const LOG_ADDRESS_BATCH = 100;
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

// Every `topic` log of `targets` from `fromBlock` to `toBlock`: one request per block range for up to
// LOG_ADDRESS_BATCH contracts. The ranges overlap by a block, and the SDK splits a range it is refused, so logs are
// deduplicated.
const getLogs = async (targets, topic, fromBlock, toBlock) => {
  const logs = new Map();
  for (const target of chunk(targets, LOG_ADDRESS_BATCH)) {
    for (let start = fromBlock; start < toBlock; start += LOG_BLOCK_RANGE) {
      const { output } = await sdk.api.util.getLogs({
        chain: CHAIN,
        target,
        topics: [topic],
        fromBlock: start,
        toBlock: Math.min(start + LOG_BLOCK_RANGE, toBlock),
        keys: [],
      });
      output.forEach((log) =>
        logs.set(`${log.transactionHash}-${log.logIndex}`, log)
      );
    }
  }
  return [...logs.values()];
};

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

  // The depositors' part of the last WINDOW_DAYS days' profit; the window opens at the factory's deployment at most.
  const now = Math.floor(Date.now() / 1000);
  const [[windowStart], latest] = await Promise.all([
    utils.getBlocksByTime([now - WINDOW_DAYS * DAY], CHAIN),
    sdk.api.util.getLatestBlock(CHAIN),
  ]);
  const fromBlock = Math.max(windowStart, FROM_BLOCK);
  const [logs, created] = await Promise.all([
    getLogs(priced.map((v) => v.splitter), DISTRIBUTED, fromBlock, latest.number),
    getLogs([VAULT_FACTORY], VAULT_CREATED, fromBlock, latest.number),
  ]);
  const earned = {};
  logs.forEach((log) => {
    const splitter = log.address.toLowerCase();
    const token = `0x${log.topics[1].slice(26)}`.toLowerCase();
    const key = `${splitter}-${token}`;
    earned[key] = (earned[key] ?? 0n) + BigInt(`0x${log.data.slice(130, 194)}`);
  });
  // A vault younger than the window is annualised over its own life, never less than a day, as the site does; its
  // age comes from its creation block at the window's block rate.
  const createdAt = {};
  created.forEach((log) => {
    createdAt[`0x${log.topics[1].slice(26)}`.toLowerCase()] = Number(log.blockNumber);
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
      const earnedUsd = [v.token0, v.token1].reduce(
        (sum, t) => sum + usd(t, earned[`${v.splitter}-${t}`] ?? 0n),
        0
      );
      const apr =
        tvlUsd > 0 ? ((earnedUsd * 365) / windowDays(v.vault) / tvlUsd) * 100 : 0;
      return {
        pool: `${v.vault}-${CHAIN}`,
        chain: utils.formatChain(CHAIN),
        project: PROJECT,
        symbol: utils.formatSymbol(
          `${meta[v.token0].symbol}-${meta[v.token1].symbol}`
        ),
        tvlUsd,
        // the realised APR, as goo.exchange/vaults shows it; compounding is not added on top
        apyBase: apr,
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
