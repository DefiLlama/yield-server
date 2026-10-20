const sdk = require('@defillama/sdk');
const utils = require('../utils');

// Quantum Pools vaults custody one Uniswap V3 / PancakeSwap V3 position NFT per
// depositor. A keeper snuggles each range (automatic rebalance) so it keeps
// earning. There is no share token, so `token` is null and each vault is one pool.
//
// tvlUsd is the vault's NFTs unwrapped at the current pool price. apyBase is the
// depositor-net fees realised on-chain over the last 24h, annualised:
//   net = sum(FeesCollected) - sum(FeeTaxed cut0, cut1)
// FeesCollected is emitted in `_collectFees()` before any decreaseLiquidity, so
// it is fees only. FeesHarvested repeats those amounts and is not summed.
// Uncollected fees are ignored, so apyBase is a lower bound for the window.
const PROJECT = 'quantum-pools';
const DAY = 24 * 60 * 60;
// Nodes that lag the tip reject eth_getLogs on the newest blocks.
const LOG_HEAD_BUFFER = 20;
// Public RPCs reject a full day of blocks (Robinhood is ~0.1s, BSC ~0.45s).
// These spans succeed on the default SDK RPCs. The SDK also widens each span
// by 10 blocks; logs are deduped so a widened edge is not counted twice.
const LOG_BLOCK_RANGE = {
  robinhood: 50_000,
  base: 50_000,
  bsc: 5_000,
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
  pools:
    'function pools(bytes32) view returns (address pool, address token0, address token1, uint24 fee, bool active)',
  decimals: 'erc20:decimals',
  symbol: 'erc20:symbol',
};

const events = {
  rebalanced:
    'event Rebalanced(address indexed owner, bytes32 indexed poolId, uint256 oldTokenId, uint256 newTokenId, int24 tickLower, int24 tickUpper)',
  collected:
    'event FeesCollected(uint256 indexed tokenId, uint256 collected0, uint256 collected1)',
  taxed:
    'event FeeTaxed(uint256 indexed tokenId, uint256 taxable0, uint256 taxable1, uint256 cut0, uint256 cut1)',
};

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

// The SDK widens each getLogs span and can repeat a boundary block when it
// splits a range. Count each log once so a split cannot double-count fees.
const dedupedArgs = (logs) => {
  const seen = new Set();
  const args = [];
  for (const log of logs) {
    const id = `${log.transactionHash}-${log.logIndex ?? log.index}`;
    if (seen.has(id) || !log.args) continue;
    seen.add(id);
    args.push(log.args);
  }
  return args;
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
    (Number(raw) / 10 ** decimalsOf[token]) * (pricesByAddress[token] || 0);

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

  // Positions burned by a snuggle in the window are not in allTokenIds().
  // Rebalanced.poolId -> vault.pools(poolId) recovers their token pair.
  const latest = await sdk.api.util.getLatestBlock(chain);
  const toBlock = Number(latest.number) - LOG_HEAD_BUFFER;
  const [fromBlock] = await utils.getBlocksByTime(
    [Math.floor(Date.now() / 1000) - DAY],
    chain
  );
  // One event at a time. Parallel getLogs across a day's chunks trips public
  // RPC limits, and a failed read must not be reported as a 0% APY.
  const logs = async (eventAbi) => {
    let lastError;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        return dedupedArgs(
          await sdk.getEventLogs({
            chain,
            target: vault,
            eventAbi,
            fromBlock: Number(fromBlock),
            toBlock,
            onlyArgs: false,
            skipCache: true,
            maxBlockRange: LOG_BLOCK_RANGE[chain],
          })
        );
      } catch (error) {
        lastError = error;
        if (attempt === 3) break;
        await new Promise((resolve) => setTimeout(resolve, 1500 * attempt));
      }
    }
    throw lastError;
  };

  const collected = await logs(events.collected);
  const taxed = await logs(events.taxed);
  const rebalanced = await logs(events.rebalanced);

  const poolIds = [...new Set(rebalanced.map((log) => log.poolId))];
  if (poolIds.length) {
    const configs = await api.multiCall({
      target: vault,
      abi: abi.pools,
      calls: poolIds,
    });
    const tokensByPool = Object.fromEntries(
      poolIds.map((id, i) => [
        id,
        [configs[i].token0.toLowerCase(), configs[i].token1.toLowerCase()],
      ])
    );
    rebalanced.forEach((log) => {
      const pair = tokensByPool[log.poolId];
      if (!pair) return;
      tokenOf[String(log.oldTokenId)] ||= pair;
      tokenOf[String(log.newTokenId)] ||= pair;
    });
  }

  const extraTokens = [...new Set(Object.values(tokenOf).flat())].filter(
    (token) => !(token in decimalsOf)
  );
  if (extraTokens.length) {
    const extraDecimals = await api.multiCall({
      abi: abi.decimals,
      calls: extraTokens,
    });
    extraTokens.forEach((token, i) => {
      decimalsOf[token] = Number(extraDecimals[i]);
    });
    Object.assign(
      pricesByAddress,
      (await utils.getPrices(extraTokens, chain)).pricesByAddress
    );
  }

  const valueOf = (tokenId, amount0, amount1) => {
    const pair = tokenOf[String(tokenId)];
    if (!pair) return null;
    return usd(pair[0], amount0) + usd(pair[1], amount1);
  };

  let netUsd = 0;
  let unmapped = 0;
  const add = (tokenId, amount0, amount1, sign) => {
    const value = valueOf(tokenId, amount0, amount1);
    if (value === null) {
      unmapped += 1;
      return;
    }
    netUsd += sign * value;
  };
  collected.forEach((log) =>
    add(log.tokenId, log.collected0, log.collected1, 1)
  );
  taxed.forEach((log) => add(log.tokenId, log.cut0, log.cut1, -1));
  if (unmapped) {
    console.error(
      `${chain} ${vault}: ${unmapped} fee logs for unknown token ids skipped`
    );
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
    apyBase: tvlUsd > 0 ? (netUsd / tvlUsd) * 365 * 100 : 0,
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
  // Sequential so a day's getLogs on fast chains does not trip public RPC limits.
  const pools = [];
  for (const vault of VAULTS) {
    const pool = await vaultPool(vault);
    if (pool) pools.push(pool);
  }
  return pools.filter(utils.keepFinite);
};

module.exports = {
  protocolId: '8856',
  timetravel: false,
  apy,
  url: 'https://app.quantumpools.io',
};
