const axios = require('axios');
const sdk = require('@defillama/sdk');
const ethers = require('ethers');
const utils = require('../utils');

// Quantum Pools vaults custody one Uniswap V3 / PancakeSwap V3 position NFT per
// depositor. A keeper snuggles each range (automatic rebalance) so it keeps
// earning. There is no share token, so `token` is null and each vault is one pool.
//
// tvlUsd is the vault's NFTs unwrapped at the current pool price.
//
// apyBase is depositor-net trading fees annualised over the time they actually
// accrued. The keeper settles several days of fees in one FeesCollected event, so
// treating that lump as a single day's yield overstates the rate by about the
// length of the gap. For each NFT still in the vault we take the latest
// settlement in a 14-day lookback and divide it by the seconds since the
// previous settlement, or since PositionCreated when that settlement is the
// position's first collection. Collections less than 6 hours apart are one
// keeper run (a dust follow-up must not be annualised on its own). A gap
// shorter than a day is skipped. Fees still uncollected, and settlements with
// no observable start, are left out, so the rate is a lower bound.
//
//   net = FeesCollected − FeeTaxed (cut0, cut1)
// FeesCollected is emitted in `_collectFees()` before any decreaseLiquidity, so
// it is fees only. FeesHarvested repeats those amounts and is not read.
const PROJECT = 'quantum-pools';
const DAY = 24 * 60 * 60;
const YEAR = 365 * DAY;
const LOOKBACK_DAYS = 14;
// Same keeper transaction, or a dust sweep minutes later, is one settlement.
const MERGE_SEC = 6 * 60 * 60;
// Nodes that lag the tip reject eth_getLogs on the newest blocks.
const LOG_HEAD_BUFFER = 20;
// Widest span the public RPC for that chain accepts. A span that still fails
// is retried and then halved. The indexer path does not use these widths.
const LOG_BLOCK_RANGE = {
  robinhood: 50_000,
  // Base public RPCs cap eth_getLogs at 1k–5k blocks. 1k is accepted by the
  // ones that answer; wider spans 403 or return "over limit" on every host.
  base: 1_000,
  bsc: 5_000,
};
const LOG_CONCURRENCY = 3;
// Binance dataseeds answer eth_getLogs with "limit exceeded" once a 14-day
// lookback is split across hundreds of spans. Pocket accepts a 5k span, including
// blocks from the start of the window, so BSC reads go there one span at a time.
const DIRECT_LOG_RPC = {
  bsc: 'https://bsc.api.pocket.network',
};

const VAULTS = [
  {
    chain: 'robinhood',
    vault: '0x5433f385F538Fa11b8A25B82230a306d25dF8EB3',
    npm: '0x73991a25C818Bf1f1128dEAaB1492D45638DE0D3',
    dex: 'Uniswap V3',
    version: 'V2',
  },
  {
    chain: 'robinhood',
    vault: '0xd3AAb853758c81c09C4510D1b05b9152F71B30F5',
    npm: '0x73991a25C818Bf1f1128dEAaB1492D45638DE0D3',
    dex: 'Uniswap V3',
    version: 'V2.1',
  },
  {
    chain: 'base',
    vault: '0x9597f68203d1bc85744A5Fc11D890aA7777e386B',
    npm: '0x03a520b32C04BF3bEEf7BEb72E919cf822Ed34f1',
    dex: 'Uniswap V3',
    version: 'V2',
  },
  {
    chain: 'base',
    vault: '0x0e8A7c9Fd76e718202B3c3530f3B587ba52FB1A8',
    npm: '0x03a520b32C04BF3bEEf7BEb72E919cf822Ed34f1',
    dex: 'Uniswap V3',
    version: 'V2.1',
  },
  {
    chain: 'bsc',
    vault: '0x9597f68203d1bc85744A5Fc11D890aA7777e386B',
    npm: '0x46A15B0b27311cedF172AB29E4f4766fbE7F4364',
    dex: 'PancakeSwap V3',
    version: 'V2.1',
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

const events = {
  collected:
    'event FeesCollected(uint256 indexed tokenId, uint256 collected0, uint256 collected1)',
  taxed:
    'event FeeTaxed(uint256 indexed tokenId, uint256 taxable0, uint256 taxable1, uint256 cut0, uint256 cut1)',
  created:
    'event PositionCreated(address indexed owner, bytes32 indexed poolId, uint256 indexed tokenId, uint128 liquidity, uint256 amount0, uint256 amount1)',
};
const logIface = new ethers.utils.Interface([
  events.collected,
  events.taxed,
  events.created,
]);

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

// The SDK widens each getLogs span and can repeat a boundary block when it
// splits a range. Count each log once.
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

const envSet = (key) =>
  process.env[`LLAMA_SDK_${key}`] ||
  process.env[`SDK_${key}`] ||
  process.env[key];

// Production sets the Llama log indexer. One full-range read is then cheaper
// than walking public RPCs, and it returns the same events.
const indexerOn = () =>
  Boolean(
    envSet('LLAMA_INDEXER_V2_ENDPOINT') || envSet('LLAMA_INDEXER_V4_ENDPOINT')
  );

const withRetry = async (fn) => {
  let lastError;
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt === 3) break;
      await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
    }
  }
  throw lastError;
};

const mapPool = async (items, limit, fn) => {
  const out = new Array(items.length);
  let cursor = 0;
  const worker = async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      out[index] = await fn(items[index]);
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, worker)
  );
  return out;
};

const spansBetween = (fromBlock, toBlock, width) => {
  const spans = [];
  for (let from = fromBlock; from <= toBlock; from += width) {
    spans.push([from, Math.min(from + width - 1, toBlock)]);
  }
  return spans;
};

const directGetLogs = async (rpc, address, fromBlock, toBlock) => {
  const { data } = await axios.post(
    rpc,
    {
      jsonrpc: '2.0',
      id: 1,
      method: 'eth_getLogs',
      params: [
        {
          address,
          fromBlock: `0x${fromBlock.toString(16)}`,
          toBlock: `0x${toBlock.toString(16)}`,
        },
      ],
    },
    { timeout: 20000 }
  );
  if (data.error) throw new Error(data.error.message || 'eth_getLogs failed');
  return data.result.map((log) => ({
    ...log,
    blockNumber: Number(log.blockNumber),
    logIndex: Number(log.logIndex),
  }));
};

// Raw vault logs for the three fee events. A failed read throws: a missed
// window must not be published as a 0% APY.
const vaultLogs = async (chain, vault, fromBlock, toBlock) => {
  if (indexerOn()) {
    const pulled = [];
    for (const eventAbi of [events.collected, events.taxed, events.created]) {
      const logs = await withRetry(() =>
        sdk.getEventLogs({
          chain,
          target: vault,
          eventAbi,
          fromBlock,
          toBlock,
          onlyArgs: false,
          skipCache: true,
          maxBlockRange: LOG_BLOCK_RANGE[chain],
        })
      );
      for (const log of logs) {
        if (!log.args) continue;
        const name = eventAbi.includes('FeesCollected')
          ? 'FeesCollected'
          : eventAbi.includes('FeeTaxed')
          ? 'FeeTaxed'
          : 'PositionCreated';
        pulled.push({ ...log, name });
      }
    }
    return deduped(pulled);
  }

  const provider = sdk.getProvider(chain);
  const directRpc = DIRECT_LOG_RPC[chain];
  const pull = (from, to) =>
    directRpc
      ? directGetLogs(directRpc, vault, from, to)
      : provider.getLogs({ address: vault, fromBlock: from, toBlock: to });
  // Pocket sometimes answers "header not found" for a span the next call can
  // read, and some widths fail while a narrower one succeeds. Retry, then halve.
  const readSpan = async (from, to) => {
    let lastError;
    for (let attempt = 1; attempt <= 5; attempt++) {
      try {
        return await pull(from, to);
      } catch (error) {
        lastError = error;
        if (attempt < 5) {
          await new Promise((resolve) => setTimeout(resolve, 250 * attempt));
        }
      }
    }
    if (to - from < 16) throw lastError;
    const mid = from + Math.floor((to - from) / 2);
    return (await readSpan(from, mid)).concat(await readSpan(mid + 1, to));
  };
  const chunks = await mapPool(
    spansBetween(fromBlock, toBlock, LOG_BLOCK_RANGE[chain]),
    directRpc ? 1 : LOG_CONCURRENCY,
    ([from, to]) => readSpan(from, to)
  );
  const decoded = [];
  for (const log of chunks.flat()) {
    let parsed;
    try {
      parsed = logIface.parseLog(log);
    } catch {
      continue;
    }
    decoded.push({
      transactionHash: log.transactionHash,
      logIndex: log.logIndex,
      blockNumber: log.blockNumber,
      name: parsed.name,
      args: parsed.args,
    });
  }
  return deduped(decoded);
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

const vaultPool = async ({ chain, vault, npm, dex, version }) => {
  const api = new sdk.ChainApi({ chain });
  const ids = await api.call({ target: vault, abi: abi.allTokenIds });
  if (!ids.length) return null;

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
  const valueBy = {};
  const unpriced = new Set();
  let tvlUsd = 0;
  positions.forEach((position, i) => {
    const token0 = position.token0.toLowerCase();
    const token1 = position.token1.toLowerCase();
    tokenOf[String(ids[i])] = [token0, token1];
    const [amount0, amount1] = amountsFor(
      position.liquidity,
      slots[i].sqrtPriceX96,
      Number(position.tickLower),
      Number(position.tickUpper)
    );
    [
      [token0, amount0],
      [token1, amount1],
    ].forEach(([token, amount]) => {
      if (amount > 0 && !pricesByAddress[token]) unpriced.add(symbolOf[token]);
      const value = usd(token, amount);
      valueBy[token] = (valueBy[token] || 0) + value;
      tvlUsd += value;
    });
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

  let annualisedUsd = 0;
  for (const [id, points] of pointsOf) {
    points.sort((a, b) => a.ts - b.ts);
    annualisedUsd += annualisedFees(points, createdTs.get(id));
  }

  const symbol = utils.formatSymbol(
    Object.entries(valueBy)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([token]) => symbolOf[token])
      .join('-')
  );

  return {
    pool: `${vault}-${chain}`.toLowerCase(),
    chain: utils.formatChain(chain),
    project: PROJECT,
    symbol,
    tvlUsd,
    apyBase: tvlUsd > 0 ? (annualisedUsd / tvlUsd) * 100 : 0,
    underlyingTokens: tokens,
    poolMeta: `${version} vault, managed ${dex} positions, ${ids.length} range${
      ids.length === 1 ? '' : 's'
    }, auto-snuggle`,
    url: 'https://app.quantumpools.io',
    // Per-depositor NFTs, no ERC-20 / ERC-4626 receipt. Opt out of pool-id extraction.
    token: null,
  };
};

const apy = async () => {
  // One vault at a time so a lookback of getLogs does not trip public RPC limits.
  // A failed read skips that vault. It is not published as 0% APY. If every
  // vault throws, fail the run so an outage is not stored as an empty adapter.
  const pools = [];
  let failed = 0;
  for (const vault of VAULTS) {
    try {
      const pool = await vaultPool(vault);
      if (pool) pools.push(pool);
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
  url: 'https://app.quantumpools.io',
};
