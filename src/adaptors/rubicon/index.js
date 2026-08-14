const sdk = require('@defillama/sdk');

const utils = require('../utils');

const PROJECT = 'rubicon';

// ---------------------------------------------------------------------------
// Rubicon LP yields — two pool systems, both fully on-chain (no subgraph):
//
//  * Aquila V2  — UniswapV2 fork. LP fee 0.30%. Where `factory.feeTo()` is
//    set (Optimism / Arbitrum / Base) the protocol takes 1/6 of LP fees via
//    mint dilution, so LPs net 5/6 of the 0.30%. `feeTo()` is probed live
//    each run rather than hardcoded.
//  * CLMM V3    — UniswapV3 fork. Per-pool fee tier (fee/1e6). The protocol
//    fee switch (`slot0.feeProtocol`) is read live per pool: when a nibble is
//    set the protocol takes 1/N of that token's swap fees and LPs keep
//    1 - 1/N (e.g. Base WETH/USDC 0.05% has feeProtocol = 85 = 0x55 → LPs
//    keep 4/5). Pools with the switch off earn the full tier.
//
// apyBase = 24h swap volume * LP fee rate * 365 / pool TVL * 100
// (standard whole-pool fee APY, same convention as other uniV2/uniV3 fork
// adapters in this repo, e.g. shapeswap-v3 / utils.apy).
//
// apyReward: Base runs live MultiRewards LP-staking contracts for the two
// Aquila RUBI pairs (RUBI streamed to staked LP tokens). Reward state
// (stakingToken, rewardRate, periodFinish, staked supply) is read on-chain
// each run; apyReward is only emitted while the stream is live.
// ---------------------------------------------------------------------------

const V2_FEE = 0.003;
const V2_PROTOCOL_CUT = 1 / 6; // LP-share dilution when feeTo is set
const SECONDS_PER_YEAR = 365 * 86400;

// MultiRewards LP-staking contracts (Curve MultiRewards layout), keyed by the
// staked Aquila pair. `stakingToken()` is re-verified on-chain every run and
// the entry is ignored on mismatch, so a redeploy can't silently mis-price.
const LP_STAKING = {
  base: {
    // Aquila WETH/RUBI pair -> StakingMultiRewards
    '0xd8edf10e243e2a176789d2ad1cb47151e76e8865':
      '0xF967db129324556D4fD83CE679b2B86FD8D5F26B',
    // Aquila USDC/RUBI pair -> StakingMultiRewards
    '0xa883c11a3742f74f0b29750764146e8675306e24':
      '0x1bcBc996fc9e57AB4D3b08A1e7A54B7AE030329C',
  },
};

// reward token streamed by the staking contracts above (rewardTokens(0))
const REWARD_TOKEN = {
  base: '0xb3836098d1e94EC651D74D053d4a0813316B2a2f', // RUBI (Base)
};

const V2_SWAP_EVENT =
  'event Swap(address indexed sender, uint256 amount0In, uint256 amount1In, uint256 amount0Out, uint256 amount1Out, address indexed to)';
const V3_SWAP_EVENT =
  'event Swap(address indexed sender, address indexed recipient, int256 amount0, int256 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick)';
const V3_POOL_CREATED_EVENT =
  'event PoolCreated(address indexed token0, address indexed token1, uint24 indexed fee, int24 tickSpacing, address pool)';

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

// Factory addresses + deploy blocks verified on-chain 2026-07-09
// (Blockscout getcontractcreation; see rubicon-integrations drafts).
const config = {
  ethereum: {
    aquilaFactory: '0x7bad585c3ae4ae266f92a4af13b388bc7b26067c',
    clmmFactory: '0xDf62D9e51d7c08360dcd41931A2e6B97FF8C73E8',
    clmmFromBlock: 24780521, // factory deploy 2026-03-31
  },
  optimism: {
    aquilaFactory: '0x3B2C6fe3039B42f00E98b76531C05932abfB258e',
    clmmFactory: '0x53f64267EDE764C53ABEbCc768aD7A96c6006D8a',
    clmmFromBlock: 149697019, // factory deploy 2026-03-31
  },
  arbitrum: {
    aquilaFactory: '0xEca3EA559b7566e610d113bbA8D1B15B085C9c68',
    clmmFactory: '0x045B7012CbD158C1b48874310F985Adb48aA62ba',
    clmmFromBlock: 447703806, // factory deploy 2026-03-31
  },
  base: {
    aquilaFactory: '0xA5cA8Ba2e3017E9aF3Bd9EDa69e9E8C263Abf6cD',
    clmmFactory: '0xB5E5A9e628FEF819150A6E5127aB481cee5d6Ca9',
    clmmFromBlock: 44100001, // factory deploy 2026-03-31
  },
};

const abi = {
  allPairsLength: 'uint256:allPairsLength',
  allPairs: 'function allPairs(uint256) view returns (address)',
  feeTo: 'address:feeTo',
  token0: 'address:token0',
  token1: 'address:token1',
  getReserves:
    'function getReserves() view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast)',
  slot0:
    'function slot0() view returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, uint8 feeProtocol, bool unlocked)',
  stakingToken: 'address:stakingToken',
  rewardData:
    'function rewardData(address) view returns (address rewardsDistributor, uint256 rewardsDuration, uint256 periodFinish, uint256 rewardRate, uint256 lastUpdateTime, uint256 rewardPerTokenStored)',
};

const bnToFloat = (value, decimals) => {
  if (value === null || value === undefined) return 0;
  return Number(value.toString()) / 10 ** Number(decimals);
};

// value one leg of a swap in USD; prefer the in-side, fall back to the
// out-side when the in-token has no llama price. never counts both sides.
const swapValueUsd = (legsIn, legsOut) => {
  const valueIn = legsIn.reduce((a, x) => a + x, 0);
  const valueOut = legsOut.reduce((a, x) => a + x, 0);
  return valueIn > 0 ? valueIn : valueOut;
};

const getTokenMeta = async (api, tokens) => {
  const unique = [...new Set(tokens.map((t) => t.toLowerCase()))];
  const [symbols, decimals] = await Promise.all([
    api.multiCall({
      abi: 'erc20:symbol',
      calls: unique,
      permitFailure: true,
    }),
    api.multiCall({
      abi: 'erc20:decimals',
      calls: unique,
      permitFailure: true,
    }),
  ]);
  const meta = {};
  unique.forEach((t, i) => {
    meta[t] = {
      symbol: symbols[i] ?? 'UNKNOWN',
      decimals: decimals[i] !== null && decimals[i] !== undefined ? Number(decimals[i]) : 18,
    };
  });
  return meta;
};

const aquilaPools = async (chain, api, fromBlock, toBlock, priceFetcher) => {
  const { aquilaFactory } = config[chain];

  const [allPairsLength, feeTo] = await Promise.all([
    api.call({ abi: abi.allPairsLength, target: aquilaFactory }),
    api.call({ abi: abi.feeTo, target: aquilaFactory }),
  ]);

  const pairs = await api.multiCall({
    abi: abi.allPairs,
    calls: [...Array(Number(allPairsLength)).keys()].map((i) => ({
      target: aquilaFactory,
      params: [i],
    })),
  });
  if (!pairs.length) return [];

  const [token0s, token1s, reserves] = await Promise.all([
    api.multiCall({ abi: abi.token0, calls: pairs }),
    api.multiCall({ abi: abi.token1, calls: pairs }),
    api.multiCall({ abi: abi.getReserves, calls: pairs }),
  ]);

  const meta = await getTokenMeta(api, [...token0s, ...token1s]);
  const prices = await priceFetcher([...token0s, ...token1s]);

  // 24h swap volume per pair from on-chain Swap logs
  const logsByPair = await sdk.getEventLogs({
    chain,
    targets: pairs,
    eventAbi: V2_SWAP_EVENT,
    fromBlock,
    toBlock,
    onlyArgs: true,
    flatten: false,
  });

  // protocol keeps 1/6 of LP fees (mint dilution) when feeTo is set
  const protocolFeeOn = feeTo && feeTo.toLowerCase() !== ZERO_ADDRESS;
  const lpFeeRate = V2_FEE * (protocolFeeOn ? 1 - V2_PROTOCOL_CUT : 1);

  // live MultiRewards LP-staking streams (apyReward), verified on-chain
  const rewardByPair = {};
  const stakingMap = LP_STAKING[chain] ?? {};
  const rewardToken = REWARD_TOKEN[chain];
  const staked = pairs
    .map((pair) => ({
      pair: pair.toLowerCase(),
      staking: stakingMap[pair.toLowerCase()],
    }))
    .filter((x) => x.staking);
  if (staked.length && rewardToken) {
    const targets = staked.map((x) => x.staking);
    const [stakingTokens, rewardDatas, stakedSupplies, lpSupplies] =
      await Promise.all([
        api.multiCall({ abi: abi.stakingToken, calls: targets, permitFailure: true }),
        api.multiCall({
          abi: abi.rewardData,
          calls: targets.map((t) => ({ target: t, params: [rewardToken] })),
          permitFailure: true,
        }),
        api.multiCall({ abi: 'erc20:totalSupply', calls: targets, permitFailure: true }),
        api.multiCall({
          abi: 'erc20:totalSupply',
          calls: staked.map((x) => x.pair),
          permitFailure: true,
        }),
      ]);
    const rewardPrices = await priceFetcher([rewardToken]);
    const rewardPrice = rewardPrices[rewardToken.toLowerCase()] ?? 0;
    const now = Math.floor(Date.now() / 1000);
    staked.forEach((x, j) => {
      // guard: the contract must actually stake this pair's LP token
      if ((stakingTokens[j] ?? '').toLowerCase() !== x.pair) return;
      const rd = rewardDatas[j];
      if (!rd || Number(rd.periodFinish) <= now) return; // stream ended
      const stakedFrac =
        Number(lpSupplies[j]) > 0
          ? Number(stakedSupplies[j]) / Number(lpSupplies[j])
          : 0;
      if (stakedFrac <= 0 || rewardPrice <= 0) return;
      rewardByPair[x.pair] = {
        // rewardRate is reward-token wei per second (18 decimals)
        rewardUsdPerYear:
          (Number(rd.rewardRate) / 1e18) * SECONDS_PER_YEAR * rewardPrice,
        stakedFrac,
      };
    });
  }

  return pairs.map((pair, i) => {
    const t0 = token0s[i].toLowerCase();
    const t1 = token1s[i].toLowerCase();
    const p0 = prices[t0] ?? 0;
    const p1 = prices[t1] ?? 0;
    const d0 = meta[t0].decimals;
    const d1 = meta[t1].decimals;

    const tvlUsd =
      bnToFloat(reserves[i].reserve0, d0) * p0 +
      bnToFloat(reserves[i].reserve1, d1) * p1;

    const volumeUsd1d = (logsByPair[i] ?? []).reduce(
      (acc, log) =>
        acc +
        swapValueUsd(
          [bnToFloat(log.amount0In, d0) * p0, bnToFloat(log.amount1In, d1) * p1],
          [bnToFloat(log.amount0Out, d0) * p0, bnToFloat(log.amount1Out, d1) * p1]
        ),
      0
    );

    const apyBase =
      tvlUsd > 0 ? ((volumeUsd1d * lpFeeRate * 365) / tvlUsd) * 100 : 0;

    // reward APR for staked LPs: annual reward USD over the USD value of the
    // staked share of the pool (rewards accrue only to staked LP tokens)
    const reward = rewardByPair[pair.toLowerCase()];
    const apyReward =
      reward && tvlUsd > 0
        ? (reward.rewardUsdPerYear / (reward.stakedFrac * tvlUsd)) * 100
        : undefined;

    return {
      pool: `${pair}-${chain}`.toLowerCase(),
      chain: utils.formatChain(chain),
      project: PROJECT,
      symbol: `${meta[t0].symbol}-${meta[t1].symbol}`,
      tvlUsd,
      apyBase,
      ...(apyReward > 0
        ? { apyReward, rewardTokens: [rewardToken] }
        : {}),
      underlyingTokens: [token0s[i], token1s[i]],
      token: pair, // V2 LP token
      poolMeta: 'Aquila V2 0.3%',
      volumeUsd1d,
    };
  });
};

const clmmPools = async (chain, api, fromBlock, toBlock, priceFetcher) => {
  const { clmmFactory, clmmFromBlock } = config[chain];

  // pool discovery straight from factory PoolCreated logs (fromBlock =
  // verified factory deploy block, so the scan window is exact)
  const created = await sdk.getEventLogs({
    chain,
    target: clmmFactory,
    eventAbi: V3_POOL_CREATED_EVENT,
    fromBlock: clmmFromBlock,
    toBlock,
    onlyArgs: true,
  });
  if (!created.length) return [];

  const pools = created.map((l) => l.pool);
  const token0s = created.map((l) => l.token0);
  const token1s = created.map((l) => l.token1);
  const feeTiers = created.map((l) => Number(l.fee));

  const meta = await getTokenMeta(api, [...token0s, ...token1s]);
  const prices = await priceFetcher([...token0s, ...token1s]);

  const [bal0s, bal1s, slot0s] = await Promise.all([
    api.multiCall({
      abi: 'erc20:balanceOf',
      calls: pools.map((p, i) => ({ target: token0s[i], params: [p] })),
      permitFailure: true,
    }),
    api.multiCall({
      abi: 'erc20:balanceOf',
      calls: pools.map((p, i) => ({ target: token1s[i], params: [p] })),
      permitFailure: true,
    }),
    api.multiCall({ abi: abi.slot0, calls: pools, permitFailure: true }),
  ]);

  const logsByPool = await sdk.getEventLogs({
    chain,
    targets: pools,
    eventAbi: V3_SWAP_EVENT,
    fromBlock,
    toBlock,
    onlyArgs: true,
    flatten: false,
  });

  return pools.map((pool, i) => {
    const t0 = token0s[i].toLowerCase();
    const t1 = token1s[i].toLowerCase();
    const p0 = prices[t0] ?? 0;
    const p1 = prices[t1] ?? 0;
    const d0 = meta[t0].decimals;
    const d1 = meta[t1].decimals;

    const tvlUsd = bnToFloat(bal0s[i], d0) * p0 + bnToFloat(bal1s[i], d1) * p1;

    // v3 swap event: positive amount = paid into the pool
    const volumeUsd1d = (logsByPool[i] ?? []).reduce((acc, log) => {
      const a0 = bnToFloat(log.amount0, d0) * p0;
      const a1 = bnToFloat(log.amount1, d1) * p1;
      return (
        acc +
        swapValueUsd(
          [a0 > 0 ? a0 : 0, a1 > 0 ? a1 : 0],
          [a0 < 0 ? -a0 : 0, a1 < 0 ? -a1 : 0]
        )
      );
    }, 0);

    // per-pool protocol fee switch, read live from slot0.feeProtocol:
    // low nibble = token0's denominator N0, high nibble = token1's N1; when a
    // nibble is nonzero the protocol takes 1/N of that token's swap fees, so
    // LPs keep 1 - 1/N. Volume here is whole-pool USD (not per-token), so we
    // use the smaller LP share when the nibbles differ (minimum-attainable).
    // Live state 2026-07-09: Base WETH/USDC 0.05% has feeProtocol = 85 (0x55,
    // LPs keep 4/5, set 2026-04-15); all other funded pools are 0.
    const fp = Number(slot0s[i]?.feeProtocol ?? 0);
    const n0 = fp & 0xf;
    const n1 = fp >> 4;
    const lpShare = Math.min(
      n0 === 0 ? 1 : 1 - 1 / n0,
      n1 === 0 ? 1 : 1 - 1 / n1
    );
    const feeRate = (feeTiers[i] / 1e6) * lpShare;
    const apyBase =
      tvlUsd > 0 ? ((volumeUsd1d * feeRate * 365) / tvlUsd) * 100 : 0;

    return {
      pool: `${pool}-${chain}`.toLowerCase(),
      chain: utils.formatChain(chain),
      project: PROJECT,
      symbol: `${meta[t0].symbol}-${meta[t1].symbol}`,
      tvlUsd,
      apyBase,
      underlyingTokens: [token0s[i], token1s[i]],
      poolMeta: `CLMM ${feeTiers[i] / 1e4}%`,
      volumeUsd1d,
    };
  });
};

const chainPools = async (chain) => {
  const now = Math.floor(Date.now() / 1000);
  // small lag so the price-api block lookup is always behind chain head
  const [toBlock, fromBlock] = await utils.getBlocksByTime(
    [now - 120, now - 120 - 86400],
    chain
  );

  const api = new sdk.ChainApi({ chain, block: undefined });

  const priceCache = {};
  const priceFetcher = async (tokens) => {
    const missing = [
      ...new Set(tokens.map((t) => t.toLowerCase())),
    ].filter((t) => !(t in priceCache));
    if (missing.length) {
      const { pricesByAddress } = await utils.getPrices(missing, chain);
      missing.forEach((t) => {
        priceCache[t] = pricesByAddress[t];
      });
    }
    return priceCache;
  };

  const [aquila, clmm] = await Promise.all([
    aquilaPools(chain, api, fromBlock, toBlock, priceFetcher),
    clmmPools(chain, api, fromBlock, toBlock, priceFetcher),
  ]);

  return [...aquila, ...clmm];
};

const apy = async () => {
  const pools = [];
  // sequential to be gentle on the price api / rpcs
  for (const chain of Object.keys(config)) {
    pools.push(...(await chainPools(chain)));
  }
  return pools.filter((p) => p.tvlUsd > 0).filter(utils.keepFinite);
};

module.exports = {
  protocolId: '799',
  timetravel: false,
  apy,
  url: 'https://app.rubicon.finance/pools',
};
