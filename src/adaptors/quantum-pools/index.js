const sdk = require('@defillama/sdk');
const utils = require('../utils');

// Quantum Pools vaults custody one Uniswap V3 / PancakeSwap V3 position NFT per
// depositor. A keeper snuggles each range (automatic rebalance) so it keeps
// earning. There is no share token, so `token` is null. Depositors pick a
// pair, so each DefiLlama row is one vault plus one underlying V3 pool, not a
// blend of every range in the vault.
//
// tvlUsd is that pool's NFTs inside the vault, unwrapped at the current price.
//
// apyBase is that pool's depositor-net trading fees, annualised over the time
// they actually accrued, divided by that pool's TVL. The keeper settles
// several days of fees in one FeesCollected event, so treating that lump as a
// single day's yield overstates the rate by about the length of the gap. For
// each NFT still in the vault we take the latest settlement in a 7-day
// lookback and divide it by the seconds since the previous settlement, or
// since PositionCreated when that settlement is the position's first
// collection. Collections less than 6 hours apart are one keeper run (a dust
// follow-up must not be annualised on its own). A gap shorter than a day is
// skipped. Fees still uncollected, and settlements with no observable start,
// are left out, so the rate is a lower bound. Annualised fees of the NFTs in
// one underlying pool are summed and divided by that pool's TVL.
//
//   net = FeesCollected − FeeTaxed (cut0, cut1)
// FeesCollected is emitted in `_collectFees()` before any decreaseLiquidity, so
// it is fees only. FeesHarvested repeats those amounts and is not read.
const PROJECT = 'quantum-pools';
const PROJECT_URL = 'https://app.quantumpools.io';
const ZERO = '0x0000000000000000000000000000000000000000';
const DAY = 24 * 60 * 60;
const YEAR = 365 * DAY;
// Settlements land every 4–5 days, so one week covers a full cycle and halves
// the log read versus a 14-day window.
const LOOKBACK_DAYS = 7;
// Same keeper transaction, or a dust sweep minutes later, is one settlement.
const MERGE_SEC = 6 * 60 * 60;
// Nodes that lag the tip reject eth_getLogs on the newest blocks.
const LOG_HEAD_BUFFER = 20;

// Live QuantumVaultV2 (v2.0) deployments from the app, plus the V2.1 vaults.
// A vault with no NFTs contributes no rows. The superseded Robinhood vault
// 0x07c688E3C1d606edc7Fe428862C08c3FA9aAEb3B is paused and empty, so it is omitted.
const VAULTS = [
  {
    chain: 'robinhood',
    vault: '0x5433f385F538Fa11b8A25B82230a306d25dF8EB3',
    npm: '0x73991a25C818Bf1f1128dEAaB1492D45638DE0D3',
    version: 'V2.0',
  },
  {
    chain: 'robinhood',
    vault: '0x5387ef1E3C335Fe4CB5EDbE218A4BDBc593cFad2',
    npm: '0x46A15B0b27311cedF172AB29E4f4766fbE7F4364',
    version: 'V2.0',
  },
  {
    chain: 'robinhood',
    vault: '0xd3AAb853758c81c09C4510D1b05b9152F71B30F5',
    npm: '0x73991a25C818Bf1f1128dEAaB1492D45638DE0D3',
    version: 'V2.1',
  },
  {
    chain: 'base',
    vault: '0x9597f68203d1bc85744A5Fc11D890aA7777e386B',
    npm: '0x03a520b32C04BF3bEEf7BEb72E919cf822Ed34f1',
    version: 'V2.0',
  },
  {
    chain: 'base',
    vault: '0x0e8A7c9Fd76e718202B3c3530f3B587ba52FB1A8',
    npm: '0x03a520b32C04BF3bEEf7BEb72E919cf822Ed34f1',
    version: 'V2.1',
  },
  {
    chain: 'bsc',
    vault: '0x57cB3160D59e967D3ac62620Fc69f7e0898d2690',
    npm: '0x7b8A01B39D58278b5DE7e48c8449c9f4F5170613',
    version: 'V2.0',
  },
  {
    chain: 'bsc',
    vault: '0x9597f68203d1bc85744A5Fc11D890aA7777e386B',
    npm: '0x46A15B0b27311cedF172AB29E4f4766fbE7F4364',
    version: 'V2.0',
  },
  {
    chain: 'flare',
    vault: '0xbff44d55fF7A5fA469A935773cD9Ca0cdAc7DbA5',
    npm: '0xEE5FF5Bc5F852764b5584d92A4d592A53DC527da',
    version: 'V2.0',
  },
];

const abi = {
  allTokenIds: 'function allTokenIds() view returns (uint256[])',
  positions:
    'function positions(uint256) view returns (uint96 nonce, address operator, address token0, address token1, uint24 fee, int24 tickLower, int24 tickUpper, uint128 liquidity, uint256 feeGrowthInside0LastX128, uint256 feeGrowthInside1LastX128, uint128 tokensOwed0, uint128 tokensOwed1)',
  factory: 'function factory() view returns (address)',
  getPool: 'function getPool(address,address,uint24) view returns (address)',
  slot0:
    'function slot0() view returns (uint160 sqrtPriceX96, int24 tick, uint16, uint16, uint16, uint32, bool)',
  decimals: 'erc20:decimals',
  symbol: 'erc20:symbol',
};

const events = [
  [
    'FeesCollected',
    'event FeesCollected(uint256 indexed tokenId, uint256 collected0, uint256 collected1)',
  ],
  [
    'FeeTaxed',
    'event FeeTaxed(uint256 indexed tokenId, uint256 taxable0, uint256 taxable1, uint256 cut0, uint256 cut1)',
  ],
  [
    'PositionCreated',
    'event PositionCreated(address indexed owner, bytes32 indexed poolId, uint256 indexed tokenId, uint128 liquidity, uint256 amount0, uint256 amount1)',
  ],
];

// Uniswap V3 liquidity to token amounts. Float math is enough for a USD TVL.
const amountsFor = (liquidity, sqrtPriceX96, tickLower, tickUpper) => {
  const sqrtPrice = Number(sqrtPriceX96) / 2 ** 96;
  const sqrtLower = Math.pow(1.0001, tickLower / 2);
  const sqrtUpper = Math.pow(1.0001, tickUpper / 2);
  const L = Number(liquidity);
  if (sqrtPrice <= sqrtLower)
    return [(L * (sqrtUpper - sqrtLower)) / (sqrtLower * sqrtUpper), 0];
  if (sqrtPrice >= sqrtUpper) return [0, L * (sqrtUpper - sqrtLower)];
  return [
    (L * (sqrtUpper - sqrtPrice)) / (sqrtPrice * sqrtUpper),
    L * (sqrtPrice - sqrtLower),
  ];
};

const asNumber = (value) => Number(value.toString());

// Uniswap / Pancake V3 fee is hundredths of a bip: 500 = 0.05%, 3000 = 0.3%,
// 10000 = 1%. poolMeta is that tier and nothing else.
const feeTier = (fee) => `${Number((Number(fee) / 1e4).toFixed(4))}%`;

// The SDK widens each getLogs span and can repeat a boundary block. Count each
// log once so a fee is not annualised twice.
const deduped = (logs) => {
  const seen = new Set();
  const out = [];
  for (const log of logs) {
    const id = `${log.transactionHash}-${log.logIndex ?? log.index}`;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(log);
  }
  return out;
};

// A failed read throws: a missed window must not be published as a 0% APY.
// sdk.getEventLogs uses the Llama indexer when it is configured and falls
// back to RPC itself.
const vaultLogs = async (chain, vault, fromBlock, toBlock) => {
  const pulled = [];
  for (const [name, eventAbi] of events) {
    const logs = await utils.withRetry(() =>
      sdk.getEventLogs({
        chain,
        target: vault,
        eventAbi,
        fromBlock,
        toBlock,
        onlyArgs: false,
      })
    );
    for (const log of logs) {
      if (!log.args) continue;
      pulled.push({ ...log, name });
    }
  }
  return deduped(pulled);
};

// Latest settlement whose accrual is at least a day. `createdTs` opens the
// first cycle when the NFT was minted inside the lookback.
const annualisedFees = (points, createdTs) => {
  if (!points.length) return 0;
  const clusters = [];
  for (const point of points) {
    const last = clusters[clusters.length - 1];
    if (last && point.ts - last.end <= MERGE_SEC) {
      last.net += point.net;
      last.end = point.ts;
    } else {
      clusters.push({ end: point.ts, net: point.net });
    }
  }
  const cycles = [];
  if (createdTs != null) {
    cycles.push({ net: clusters[0].net, dt: clusters[0].end - createdTs });
  }
  for (let i = 1; i < clusters.length; i++) {
    cycles.push({
      net: clusters[i].net,
      dt: clusters[i].end - clusters[i - 1].end,
    });
  }
  for (let i = cycles.length - 1; i >= 0; i--) {
    if (cycles[i].dt >= DAY && cycles[i].net > 0) {
      return (cycles[i].net * YEAR) / cycles[i].dt;
    }
  }
  return 0;
};

const vaultPools = async ({ chain, vault, npm, version }) => {
  const api = new sdk.ChainApi({ chain });
  const ids = await api.call({ target: vault, abi: abi.allTokenIds });
  if (!ids.length) return [];

  const positions = await api.multiCall({
    target: npm,
    abi: abi.positions,
    calls: ids,
  });
  const factory = await api.call({ target: npm, abi: abi.factory });
  const pools = await api.multiCall({
    target: factory,
    abi: abi.getPool,
    calls: positions.map((p) => ({ params: [p.token0, p.token1, p.fee] })),
  });
  const slots = await api.multiCall({ abi: abi.slot0, calls: pools });

  const tokens = [
    ...new Set(
      positions.flatMap((p) => [p.token0.toLowerCase(), p.token1.toLowerCase()])
    ),
  ];
  const [decimals, symbols] = await Promise.all([
    api.multiCall({ abi: abi.decimals, calls: tokens }),
    api.multiCall({ abi: abi.symbol, calls: tokens, permitFailure: true }),
  ]);
  const decimalsOf = Object.fromEntries(
    tokens.map((token, i) => [token, Number(decimals[i])])
  );
  const symbolOf = Object.fromEntries(
    tokens.map((token, i) => [token, symbols[i] || token.slice(0, 8)])
  );
  const { pricesByAddress } = await utils.getPrices(tokens, chain);
  const usd = (token, raw) =>
    (asNumber(raw) / 10 ** decimalsOf[token]) * (pricesByAddress[token] || 0);

  const tokenOf = {};
  const poolOf = {};
  const groups = new Map();
  const unpriced = new Set();
  positions.forEach((position, i) => {
    const underlying = String(pools[i] || '').toLowerCase();
    if (!underlying || underlying === ZERO) return;
    const token0 = position.token0.toLowerCase();
    const token1 = position.token1.toLowerCase();
    const id = String(ids[i]);
    tokenOf[id] = [token0, token1];
    poolOf[id] = underlying;
    const [amount0, amount1] = amountsFor(
      position.liquidity,
      slots[i].sqrtPriceX96,
      Number(position.tickLower),
      Number(position.tickUpper)
    );
    let tvl = 0;
    [
      [token0, amount0],
      [token1, amount1],
    ].forEach(([token, amount]) => {
      if (amount > 0 && !pricesByAddress[token]) unpriced.add(symbolOf[token]);
      tvl += usd(token, amount);
    });
    if (!groups.has(underlying)) {
      groups.set(underlying, {
        underlying,
        token0,
        token1,
        fee: Number(position.fee),
        tvlUsd: 0,
        annualisedUsd: 0,
      });
    }
    groups.get(underlying).tvlUsd += tvl;
  });
  if (unpriced.size) {
    console.error(
      `${chain} ${vault}: no DefiLlama price for ${[...unpriced].join(
        ', '
      )} (excluded from TVL)`
    );
  }

  const latest = await sdk.api.util.getLatestBlock(chain);
  const toBlock = Number(latest.number) - LOG_HEAD_BUFFER;
  const now = Math.floor(Date.now() / 1000);
  const [fromBlock] = await utils.getBlocksByTime(
    [now - LOOKBACK_DAYS * DAY],
    chain
  );
  const provider = sdk.getProvider(chain);
  const [tip, anchor] = await Promise.all([
    provider.getBlock(toBlock),
    provider.getBlock(Number(fromBlock)),
  ]);
  const spanBlocks = toBlock - Number(fromBlock);
  const secPerBlock = (tip.timestamp - anchor.timestamp) / spanBlocks;
  const tsOf = (block) =>
    anchor.timestamp + (Number(block) - Number(fromBlock)) * secPerBlock;

  console.error(
    `${chain} ${version}: ${LOOKBACK_DAYS}d fee settlements ${Number(
      fromBlock
    )}-${toBlock}`
  );
  const logs = await vaultLogs(chain, vault, Number(fromBlock), toBlock);
  const pointsOf = new Map();
  const createdTs = new Map();
  const pushPoint = (tokenId, ts, net) => {
    const id = String(tokenId);
    if (!tokenOf[id]) return;
    if (!pointsOf.has(id)) pointsOf.set(id, []);
    pointsOf.get(id).push({ ts, net });
  };
  logs.forEach((log) => {
    const { name } = log;
    const ts = tsOf(log.blockNumber);
    if (name === 'FeesCollected') {
      const pair = tokenOf[String(log.args.tokenId)];
      if (!pair) return;
      pushPoint(
        log.args.tokenId,
        ts,
        usd(pair[0], log.args.collected0) + usd(pair[1], log.args.collected1)
      );
    } else if (name === 'FeeTaxed') {
      const pair = tokenOf[String(log.args.tokenId)];
      if (!pair) return;
      pushPoint(
        log.args.tokenId,
        ts,
        -(usd(pair[0], log.args.cut0) + usd(pair[1], log.args.cut1))
      );
    } else if (name === 'PositionCreated') {
      const id = String(log.args.tokenId);
      if (!tokenOf[id]) return;
      const prev = createdTs.get(id);
      if (prev == null || ts < prev) createdTs.set(id, ts);
    }
  });

  for (const [id, points] of pointsOf) {
    const group = groups.get(poolOf[id]);
    if (!group) continue;
    points.sort((a, b) => a.ts - b.ts);
    group.annualisedUsd += annualisedFees(points, createdTs.get(id));
  }

  return [...groups.values()]
    .filter((group) => group.tvlUsd > 0)
    .map((group) => ({
      pool: `${vault}-${group.underlying}-${chain}`.toLowerCase(),
      chain: utils.formatChain(chain),
      project: PROJECT,
      symbol: `${symbolOf[group.token0]}-${symbolOf[group.token1]}`,
      tvlUsd: group.tvlUsd,
      apyBase: (group.annualisedUsd / group.tvlUsd) * 100,
      underlyingTokens: [group.token0, group.token1],
      poolMeta: feeTier(group.fee),
      url: PROJECT_URL,
      // Per-depositor NFTs, no ERC-20 / ERC-4626 receipt. Opt out of pool-id extraction.
      token: null,
    }));
};

const apy = async () => {
  // One vault at a time so a lookback of getLogs does not trip public RPC limits.
  // A failed read skips that vault. It is not published as 0% APY. If every
  // vault throws, fail the run so an outage is not stored as an empty adapter.
  const pools = [];
  let failed = 0;
  for (const vault of VAULTS) {
    try {
      const rows = await vaultPools(vault);
      if (rows.length) pools.push(...rows);
    } catch (error) {
      failed += 1;
      const reason =
        (error && error.message) ||
        (error && error.llamaRPCError
          ? `RPC ${error.method || 'read'} failed`
          : String(error));
      console.error(`${vault.chain} ${vault.vault}: skipped (${reason})`);
    }
  }
  if (failed === VAULTS.length) {
    throw new Error('quantum-pools: all vaults failed');
  }
  return pools.filter(utils.keepFinite);
};

module.exports = {
  protocolId: '8856',
  timetravel: false,
  apy,
  url: PROJECT_URL,
};
