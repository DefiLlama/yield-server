const axios = require('axios');
const sdk = require('@defillama/sdk');

const utils = require('../utils');

// Only actively marketed strategies are listed on the yields page; protocol
// TVL is tracked separately (DefiLlama-Adapters) and counts every vault.
const config = {
  base: [
    '0x2406aacbdF8463176DeB285AdAa81768415B6c7E', // Alpha Strategies HYPE++ Base
  ],
  arbitrum: [
    '0x75288264FDFEA8ce68e6D852696aB1cE2f3E5004', // Alpha Strategies HYPE++ Arbitrum
  ],
  hyperliquid: [
    '0xf44f49E6577B3934f981C6f0629d15154d2606E6', // hXXI BTC
    '0x6bf9345b5d6b27b5cbf2e463dc5e0b2afcedc21c', // dgnUpside
    '0x3ebb11ba6a5b61c04d1a703ea10728d519945440', // d2HYPE
    '0x195eb4d088f222c982282b5dd495e76dba4bc7d1', // Alpha Strategies HYPE++ hyperliquid
    '0x208f63A7F60C319597C05Fa5eC67FDe41839baD6', // texasHedge
  ],
};

// D2 vaults trade in discrete epochs: funds are custodied (FundsCustodied),
// traded, then returned with pnl (FundsReturned) net of fees. NAV (pricePerShare) only
// updates at settlement, so a fixed trailing window reads 0% whenever no epoch
// settled inside it. PricePerShare starts at exactly 1.0 (ERC-4626), so
// all-time NAV growth needs no historical calls. Two figures are reported:
//   apyBase          = (pps - 1) * 365/effectiveTradingDays * 100
//                      (days capital was deployed: sum of custody->return
//                      spans from on-chain epoch events — strategy performance)
//   apyBaseInception = (pps - 1) * 365/daysSinceDeploy * 100
//                      (calendar basis — what a deposit-and-hold user earned)
// All values reported are net of fees and match what the users realize. 
const DEPLOY_BLOCKS = {
  '0x195eb4d088f222c982282b5dd495e76dba4bc7d1': 11326226, // HYPE++ hyperliquid
  '0x75288264fdfea8ce68e6d852696ab1ce2f3e5004': 276124793, // HYPE++ arbitrum
  '0x2406aacbdf8463176deb285adaa81768415b6c7e': 37242442, // HYPE++ base
  '0xf44f49e6577b3934f981c6f0629d15154d2606e6': 3387093, // hXXI BTC hyperliquid
  '0x3ebb11ba6a5b61c04d1a703ea10728d519945440': 4369757, // d2HYPE hyperliquid
  '0x6bf9345b5d6b27b5cbf2e463dc5e0b2afcedc21c': 5339834, // dgnUpside hyperliquid
  '0x208f63a7f60c319597c05fa5ec67fde41839bad6': 26267244, // texasHedge hyperliquid
};

const abis = {
  totalAssets: {
    inputs: [],
    name: 'totalAssets',
    outputs: [{ type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  asset: {
    inputs: [],
    name: 'asset',
    outputs: [{ type: 'address' }],
    stateMutability: 'view',
    type: 'function',
  },
  convertToAssets: {
    inputs: [{ type: 'uint256' }],
    name: 'convertToAssets',
    outputs: [{ type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
};

// timestamp of the vault's deploy block; null when unavailable
const getDeployTimestamp = async (chain, deployBlock) => {
  try {
    return await sdk.api.util.getTimestamp(deployBlock, chain);
  } catch (e) {
    return null;
  }
};

// keccak256 topics of the epoch events (verified against the vault ABI)
// FundsCustodied(uint256 indexed epoch, uint256 amount)
const CUSTODY_TOPIC =
  '0x69e193dd4c77613d0e599740c9e2cd88fb7b4a9d11ef9b1f6226d392c941f471';
// FundsReturned(uint256 indexed epoch, uint256 amount)
const RETURN_TOPIC =
  '0xe5e9cfeede9ff1fc77b415bf8346e29706d16794b3bdeca347ac54a7fd3e0c3c';

const SCAN_CONCURRENCY = 10;
const MAX_SCAN_CALLS = 1500; // skip an RPC whose range cap needs more calls

// archival endpoints known to serve wide eth_getLogs ranges, tried first;
// the sdk provider list (env-configured in production) is tried after. The
// sdk's own list is unreliable here: its liveness filter can drop the only
// wide-range RPC, and most hyperliquid RPCs cap ranges at 1k-10k blocks.
const PREFERRED_SCAN_RPCS = {
  hyperliquid: ['https://rpc.purroofgroup.com'],
};

const toHex = (n) => '0x' + n.toString(16);

const rpcGetLogs = async (rpc, filter) => {
  const { data } = await axios.post(
    rpc,
    { jsonrpc: '2.0', id: 1, method: 'eth_getLogs', params: [filter] },
    { timeout: 30_000 }
  );
  if (data.error)
    throw new Error(data.error.message ?? JSON.stringify(data.error));
  return data.result;
};

// transient failures (429s, timeouts) on one chunk must not kill a whole scan
const rpcGetLogsWithRetry = async (rpc, filter, attempts = 3) => {
  for (let i = 1; ; i++) {
    try {
      return await rpcGetLogs(rpc, filter);
    } catch (e) {
      if (i >= attempts) throw e;
      await new Promise((r) => setTimeout(r, 500 * i));
    }
  }
};

// Scan one chain against a single RPC. The first window tries the full span;
// on a range error the chunk shrinks to the cap the RPC names in its error
// message (else halves), then the remaining windows run concurrently.
const scanWithRpc = async (rpc, address, start, latest) => {
  const topics = [[CUSTODY_TOPIC, RETURN_TOPIC]];
  const span = latest - start + 1;
  let chunk = span;
  let logs;
  for (;;) {
    try {
      logs = await rpcGetLogs(rpc, {
        address,
        topics,
        fromBlock: toHex(start),
        toBlock: toHex(Math.min(start + chunk - 1, latest)),
      });
      break;
    } catch (e) {
      // the cap is the smallest number >= 1000 in the error message
      // (other numbers are block heights / the failing span itself)
      const caps = (String(e.message).match(/\d[\d,]*/g) ?? [])
        .map((n) => Number(n.replace(/,/g, '')))
        .filter((n) => n >= 1000 && n < chunk);
      const next = caps.length ? Math.min(...caps) : Math.floor(chunk / 2);
      if (next < 1000 || Math.ceil(span / next) > MAX_SCAN_CALLS) throw e;
      chunk = next;
    }
  }

  const ranges = [];
  for (let b = start + chunk; b <= latest; b += chunk)
    ranges.push([b, Math.min(b + chunk - 1, latest)]);
  for (let i = 0; i < ranges.length; i += SCAN_CONCURRENCY) {
    const batch = await Promise.all(
      ranges.slice(i, i + SCAN_CONCURRENCY).map(([a, b]) =>
        rpcGetLogsWithRetry(rpc, {
          address,
          topics,
          fromBlock: toHex(a),
          toBlock: toHex(b),
        })
      )
    );
    batch.forEach((l) => logs.push(...l));
  }
  return logs;
};

// One fan-in scan per chain: every vault address and both epoch topics in a
// single eth_getLogs filter, from the chain's earliest vault deploy block.
// Public RPCs for one chain enforce very different range caps, so per-request
// rotation is unreliable — instead the sdk's RPC list is tried one endpoint
// at a time and the whole scan runs against the first one that works.
const scanEpochLogs = async (chain, vaults) => {
  const fromBlocks = vaults
    .map((v) => DEPLOY_BLOCKS[v.toLowerCase()])
    .filter(Boolean);
  if (!fromBlocks.length) return [];
  const provider = sdk.getProvider(chain);
  const rpcs = [
    ...new Set([
      ...(PREFERRED_SCAN_RPCS[chain] ?? []),
      ...[...(provider.archivalRPCs ?? []), ...(provider.rpcs ?? [])].map(
        (r) => r.url
      ),
    ]),
  ].filter((u) => !u.includes('llamarpc.com'));
  const { number: latest } = await sdk.api.util.getLatestBlock(chain);
  const start = Math.min(...fromBlocks);

  const errors = [];
  for (const rpc of rpcs) {
    try {
      return await scanWithRpc(rpc, vaults, start, latest);
    } catch (e) {
      errors.push(`${rpc}: ${e.message}`);
    }
  }
  throw new Error(`epoch scan failed on ${chain}: ${errors.join(' | ')}`);
};

// vault (lowercase) -> total days capital was deployed, summed over the
// custody->return span of every completed epoch; {} on failure
const getTradingDays = async (chain, vaults) => {
  try {
    const logs = await scanEpochLogs(chain, vaults);

    const byVault = {};
    for (const log of logs) {
      const vault = log.address.toLowerCase();
      byVault[vault] = byVault[vault] ?? { custody: {}, returned: {} };
      const epoch = BigInt(log.topics[1]).toString();
      const side = log.topics[0] === CUSTODY_TOPIC ? 'custody' : 'returned';
      byVault[vault][side][epoch] = Number(log.blockNumber);
    }

    const pairs = [];
    for (const [vault, { custody, returned }] of Object.entries(byVault)) {
      for (const [epoch, endBlock] of Object.entries(returned)) {
        const startBlock = custody[epoch];
        if (startBlock !== undefined) pairs.push({ vault, startBlock, endBlock });
      }
    }
    if (!pairs.length) return {};

    const blocks = [...new Set(pairs.flatMap((p) => [p.startBlock, p.endBlock]))];
    const tsByBlock = {};
    for (let i = 0; i < blocks.length; i += SCAN_CONCURRENCY) {
      const batch = blocks.slice(i, i + SCAN_CONCURRENCY);
      const ts = await Promise.all(
        batch.map((b) => sdk.api.util.getTimestamp(b, chain))
      );
      batch.forEach((b, j) => (tsByBlock[b] = ts[j]));
    }

    const days = {};
    for (const p of pairs) {
      const delta = tsByBlock[p.endBlock] - tsByBlock[p.startBlock];
      if (delta > 0) days[p.vault] = (days[p.vault] ?? 0) + delta / 86400;
    }
    return days;
  } catch (e) {
    console.error(`d2-finance: trading-days scan failed on ${chain}:`, e.message);
    return {};
  }
};

const chainPools = async (chain, vaults) => {
  const calls = vaults.map((vault) => ({ target: vault }));
  const [totalAssets, assets, symbols, decimals] = await Promise.all([
    sdk.api.abi.multiCall({ abi: abis.totalAssets, calls, chain, permitFailure: true }),
    sdk.api.abi.multiCall({ abi: abis.asset, calls, chain, permitFailure: true }),
    sdk.api.abi.multiCall({ abi: 'erc20:symbol', calls, chain, permitFailure: true }),
    sdk.api.abi.multiCall({ abi: 'erc20:decimals', calls, chain, permitFailure: true }),
  ]);

  const now = Math.floor(Date.now() / 1000);
  const oneShareCalls = vaults.map((vault, i) => ({
    target: vault,
    params: [(10n ** BigInt(decimals.output[i].output ?? 18)).toString()],
  }));
  const [ppsNow, deployTimestamps, tradingDaysByVault] = await Promise.all([
    sdk.api.abi.multiCall({
      abi: abis.convertToAssets,
      calls: oneShareCalls,
      chain,
      permitFailure: true,
    }),
    Promise.all(
      vaults.map((vault) => {
        const deployBlock = DEPLOY_BLOCKS[vault.toLowerCase()];
        return deployBlock ? getDeployTimestamp(chain, deployBlock) : null;
      })
    ),
    getTradingDays(chain, vaults),
  ]);

  const assetAddresses = assets.output.map((o) => o.output);
  const { pricesByAddress } = await utils.getPrices(
    [...new Set(assetAddresses.filter(Boolean))],
    chain
  );
  const assetDecimals = await sdk.api.abi.multiCall({
    abi: 'erc20:decimals',
    calls: assetAddresses.map((target) => ({ target })),
    chain,
    permitFailure: true,
  });

  return vaults.map((vault, i) => {
    const asset = assetAddresses[i];
    const price = pricesByAddress[asset?.toLowerCase()];
    if (!asset || !price) return null;

    const assetDecimal = Number(assetDecimals.output[i].output ?? 18);
    const tvlUsd =
      (Number(totalAssets.output[i].output) / 10 ** assetDecimal) * price;

    const rawNow = Number(ppsNow.output[i].output);
    const pricePerShare = rawNow / 10 ** assetDecimal;

    // calendar basis: all-time NAV growth annualized since deploy
    const deployTs = deployTimestamps[i];
    const daysSinceDeploy = deployTs != null ? (now - deployTs) / 86400 : null;
    const calendarApr =
      daysSinceDeploy > 1 && rawNow > 0
        ? (pricePerShare - 1) * (365 / daysSinceDeploy) * 100
        : null;

    // trading-days basis: same NAV growth annualized over deployed time only
    const tradingDays = tradingDaysByVault[vault.toLowerCase()];
    const tradingDaysApr =
      tradingDays > 0 && rawNow > 0
        ? (pricePerShare - 1) * (365 / tradingDays) * 100
        : null;

    // vaults with no completed epoch yet report 0 rather than null so the
    // pool (and its TVL) still lists
    const apyBase = tradingDaysApr ?? calendarApr ?? (rawNow > 0 ? 0 : null);

    return {
      pool: `${vault}-${chain}`.toLowerCase(),
      chain: utils.formatChain(chain),
      project: 'd2-finance',
      symbol: symbols.output[i].output ?? '',
      tvlUsd,
      apyBase,
      // calendar-basis figure (deposit-and-hold experience) in the
      // schema's dedicated since-inception field
      apyBaseInception: calendarApr,
      underlyingTokens: [asset],
      pricePerShare,
      url: `https://d2.finance/strategies/${vault}`,
    };
  });
};

const poolsFunction = async () => {
  const results = await Promise.allSettled(
    Object.entries(config).map(([chain, vaults]) => chainPools(chain, vaults))
  );
  const pools = results
    .filter((r) => r.status === 'fulfilled')
    .flatMap((r) => r.value);

  return pools.filter(Boolean).filter((p) => utils.keepFinite(p));
};

module.exports = {
  protocolId: '4846',
  timetravel: false,
  apy: poolsFunction,
  url: 'https://d2.finance',
};
