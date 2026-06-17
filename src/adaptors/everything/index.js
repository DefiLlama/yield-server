const sdk = require('@defillama/sdk');
const { request, gql } = require('graphql-request');
const utils = require('../utils');
const { farmingRangeABI } = require('./abis');

const project = 'everything';
const appUrl = 'https://app.everything.inc/liquidity';

const EV_TOKEN_ADDRESS = '0xe7e7e741c23a4767831a56a8c99f522c5ac1e7e7';
const SECONDS_IN_DAY = 86400;
const DAYS_IN_YEAR = 365;
const PAGE_SIZE = 1000;

const CONFIG = {
  arbitrum: {
    SUBGRAPH:
      'https://graphnode.prod.everything.inc/subgraphs/name/unipool-arbitrum-0-9-3-v2',
    FARMING_ADDRESS: '0x53d165df0414bd02e91747775450934bf2257f69',
    TIME_BETWEEN_BLOCK: 0.25,
    FARMING_CAMPAIGNS: {
      '0xfa896ef9659ea0dcf42c751e2b1f78f626fe8f56': 10,
      '0x6ce2b09bb578137130e17a0476a6adcf0ac7b0da': 11,
    },
  },
  base: {
    SUBGRAPH:
      'https://graphnode.prod.everything.inc/subgraphs/name/unipool-base-v0-0-1',
    FARMING_ADDRESS: '0xa5d378c05192e3f1f365d6298921879c4d51c5a3',
    TIME_BETWEEN_BLOCK: 2.0,
    FARMING_CAMPAIGNS: {
      '0xa9ab48b7e1577eef7ff6babc0870bd0f00131f76': 7,
    },
  },
  bsc: {
    SUBGRAPH:
      'https://graphnode.prod.everything.inc/subgraphs/name/unipool-bsc-v0-0-1',
    FARMING_ADDRESS: '0xb891aeb2130805171796644a2af76fc7ff25a0b9',
    TIME_BETWEEN_BLOCK: 0.45,
    FARMING_CAMPAIGNS: {
      '0xce3b00f6badbceb506d97b6b32e0ac68c2cafd6b': 20,
    },
  },
  ethereum: {
    SUBGRAPH:
      'https://graphnode.prod.everything.inc/subgraphs/name/unipool-ethereum-v0-0-1',
    FARMING_ADDRESS: '0x7d85c0905a6e1ab5837a0b57cd94a419d3a77523',
    TIME_BETWEEN_BLOCK: 12.0,
    FARMING_CAMPAIGNS: {
      '0x048af8f22d76cd832aba6acba15009bb618db261': 24, // sUSDe/USDT
      '0x3231d6aea7a71b3e8e8541995ae4e8a2e61081b4': 25, // WstETH/WETH
      '0xbb34cd8fea10a49cb5caf811b0a568f465bd4c6c': 26, // wNVDAx/USDT
      '0x0168d6b8808f7434cf4d10fd05566b4c4bbadd62': 27, // wSPCXx/USDT
    },
  },
};

const queryPairs = gql`
  {
    pairs(first: 1000, orderBy: reserveToken0, orderDirection: desc) {
      id
      token0 {
        id
        symbol
        decimals
      }
      token1 {
        id
        symbol
        decimals
      }
      reserveToken0
      reserveToken1
    }
  }
`;

// Paginated swap query; uses id_gt cursor so results beyond PAGE_SIZE are not dropped.
const queryRecentSwaps = `{
  swaps(
    first: ${PAGE_SIZE}
    where: { timestamp_gte: "<TIMESTAMP>", id_gt: "<ID_CURSOR>" }
    orderBy: id
    orderDirection: asc
  ) {
    id
    pair {
      id
      token0 { decimals }
      token1 { decimals }
    }
    amountIn
    isZeroForOne
    lpFee
  }
}`;

const fetchAllSwaps = async (subgraphUrl, timestamp) => {
  const allSwaps = [];
  let idCursor = '';

  while (true) {
    const query = queryRecentSwaps
      .replace('<TIMESTAMP>', timestamp)
      .replace('<ID_CURSOR>', idCursor);

    const data = await request(subgraphUrl, query);
    const page = data.swaps || [];
    allSwaps.push(...page);
    if (page.length < PAGE_SIZE) break;
    idCursor = page[page.length - 1].id;
  }

  return allSwaps;
};

/**
 * Fetch farming reward APY for pools that have active campaigns.
 */
const fetchFarmingRewards = async (chainString, config, poolPrices) => {
  const { FARMING_ADDRESS, FARMING_CAMPAIGNS, TIME_BETWEEN_BLOCK } = config;
  if (!FARMING_ADDRESS || !FARMING_CAMPAIGNS) return {};

  const BLOCKS_PER_YEAR = Math.floor(
    (SECONDS_IN_DAY * DAYS_IN_YEAR) / TIME_BETWEEN_BLOCK
  );

  const campaignIds = Object.values(FARMING_CAMPAIGNS);
  if (campaignIds.length === 0) return {};

  // Get campaign infos
  const { output: campaignInfos } = await sdk.api.abi.multiCall({
    target: FARMING_ADDRESS,
    abi: farmingRangeABI.find(({ name }) => name === 'campaignInfo'),
    calls: campaignIds.map((id) => ({ params: [id] })),
    chain: chainString,
  });

  // Get current block
  const block = (await sdk.api.util.getLatestBlock(chainString)).number;

  // Get reward info for active campaigns
  const { output: rewardLens } = await sdk.api.abi.multiCall({
    target: FARMING_ADDRESS,
    abi: farmingRangeABI.find(({ name }) => name === 'rewardInfoLen'),
    calls: campaignIds.map((id) => ({ params: [id] })),
    chain: chainString,
  });

  // Get last reward phase for each campaign
  const rewardInfoCalls = [];
  for (const rl of rewardLens) {
    if (!rl.success) continue;
    const len = Number(rl.output);
    if (len === 0) continue;
    // Get the last phase (most likely active or latest)
    for (let i = 0; i < len; i++) {
      rewardInfoCalls.push({ params: [rl.input.params[0], i] });
    }
  }

  let rewardInfos = [];
  if (rewardInfoCalls.length > 0) {
    const { output } = await sdk.api.abi.multiCall({
      target: FARMING_ADDRESS,
      abi: farmingRangeABI.find(({ name }) => name === 'campaignRewardInfo'),
      calls: rewardInfoCalls,
      chain: chainString,
    });
    rewardInfos = output;
  }

  // EV reward token price. EV is deployed at the same address on every
  // supported chain (arbitrum/base/bsc/ethereum) and is the reward token for
  // all campaigns, so we price it via Arbitrum, its most liquid market.
  const evPriceData = await utils.getPriceApiData(
    `/prices/current/arbitrum:${EV_TOKEN_ADDRESS}`
  );
  const evPrice = evPriceData.coins[`arbitrum:${EV_TOKEN_ADDRESS}`]?.price || 0;

  // Build rewards map: pairAddress -> apyReward
  const rewards = {};
  for (const [pairAddr, campaignId] of Object.entries(FARMING_CAMPAIGNS)) {
    const info = campaignInfos.find(
      (c) => c.success && Number(c.input.params[0]) === campaignId
    );
    if (!info || !info.output) continue;
    if (block < Number(info.output.startBlock)) continue;

    const totalStaked = BigInt(info.output.totalStaked);
    if (totalStaked === 0n) continue;

    // Find active reward phase
    const phases = rewardInfos.filter(
      (r) => r.success && Number(r.input.params[0]) === campaignId
    );
    let activePhase = null;
    for (const phase of phases) {
      if (block < Number(phase.output.endBlock)) {
        activePhase = phase.output;
        break;
      }
    }
    if (!activePhase || BigInt(activePhase.rewardPerBlock) === 0n) continue;

    const rewardPerBlock = Number(activePhase.rewardPerBlock) / 1e18;
    const totalStakedFloat = Number(totalStaked) / 1e18;

    const poolPrice = poolPrices[pairAddr.toLowerCase()] || 0;
    if (poolPrice <= 0 || evPrice <= 0) continue;

    const annualRewardUsd = rewardPerBlock * BLOCKS_PER_YEAR * evPrice;
    const totalStakedUsd = totalStakedFloat * poolPrice;
    const apyReward = (annualRewardUsd / totalStakedUsd) * 100;

    rewards[pairAddr.toLowerCase()] = apyReward;
  }

  return rewards;
};

const getPoolsForChain = async (chainString) => {
  const config = CONFIG[chainString];
  const subgraphUrl = config.SUBGRAPH;

  // Fetch current pairs from subgraph
  const dataNow = (await request(subgraphUrl, queryPairs)).pairs;

  if (!dataNow || dataNow.length === 0) return [];

  // Query recent swaps (last 24h) for volume/fee calculation
  const timestamp24hAgo = Math.floor(Date.now() / 1000) - SECONDS_IN_DAY;
  let swapsFetched = true;
  let recentSwaps = [];
  try {
    recentSwaps = await fetchAllSwaps(subgraphUrl, timestamp24hAgo);
  } catch (e) {
    console.error(
      `everything: swap query failed for ${chainString}:`,
      e.message
    );
    swapsFetched = false;
  }

  // Normalize reserves to human-readable
  const pairs = dataNow.map((p) => ({
    ...p,
    reserve0: Number(p.reserveToken0) / 10 ** p.token0.decimals,
    reserve1: Number(p.reserveToken1) / 10 ** p.token1.decimals,
  }));

  // Get token prices and compute TVL
  const pairsWithTvl = await utils.tvl(pairs, chainString);

  // Aggregate 24h fee volume per pair from swap events
  // Each swap has amountIn (raw), isZeroForOne, and lpFee (bps)
  // Fee earned by LPs = amountIn * lpFee / 10000
  const feesByPair = {};
  for (const swap of recentSwaps) {
    const pairId = swap.pair.id.toLowerCase();
    const decimals = swap.isZeroForOne
      ? swap.pair.token0.decimals
      : swap.pair.token1.decimals;
    const amountIn = Number(swap.amountIn) / 10 ** decimals;
    const lpFeeBps = Number(swap.lpFee);
    const feeAmount = (amountIn * lpFeeBps) / 10000;

    if (!feesByPair[pairId])
      feesByPair[pairId] = { token0Fees: 0, token1Fees: 0 };
    if (swap.isZeroForOne) {
      feesByPair[pairId].token0Fees += feeAmount;
    } else {
      feesByPair[pairId].token1Fees += feeAmount;
    }
  }

  // Compute LP token price for farming reward calculation
  const farmPairs = Object.keys(config.FARMING_CAMPAIGNS || {});
  let poolPrices = {};
  if (farmPairs.length > 0) {
    const { output: supplyResults } = await sdk.api.abi.multiCall({
      abi: 'erc20:totalSupply',
      calls: farmPairs.map((addr) => ({ target: addr })),
      chain: chainString,
    });
    for (const res of supplyResults) {
      if (!res.success) continue;
      const addr = res.input.target.toLowerCase();
      const totalSupply = Number(res.output) / 1e18;
      const pool = pairsWithTvl.find((p) => p.id.toLowerCase() === addr);
      if (pool && totalSupply > 0) {
        poolPrices[addr] = pool.totalValueLockedUSD / totalSupply;
      }
    }
  }

  // Fetch farming rewards
  const farmingRewards = await fetchFarmingRewards(
    chainString,
    config,
    poolPrices
  );

  // Build pool entries
  return pairsWithTvl
    .map((p) => {
      const tvlUsd = p.totalValueLockedUSD;
      if (!tvlUsd || tvlUsd < 1000) return null;

      const pairId = p.id.toLowerCase();

      // Calculate 24h fee revenue in USD
      const pairFees = feesByPair[pairId];
      let feeUSD1d = 0;
      if (pairFees) {
        if (pairFees.token0Fees && p.price0) {
          feeUSD1d += pairFees.token0Fees * p.price0;
        }
        if (pairFees.token1Fees && p.price1) {
          feeUSD1d += pairFees.token1Fees * p.price1;
        }
      }
      // When the swap query failed we don't know the fee revenue, so apyBase is
      // unknown (null) rather than a misleading 0.
      const apyBase = !swapsFetched
        ? null
        : tvlUsd > 0
        ? (feeUSD1d * 365 * 100) / tvlUsd
        : 0;

      const apyReward = farmingRewards[pairId] || 0;

      const symbol = `${p.token0.symbol}-${p.token1.symbol}`;

      return {
        pool: `${pairId}-${chainString}`.toLowerCase(),
        chain: utils.formatChain(chainString),
        project,
        symbol,
        tvlUsd,
        apyBase: Number.isFinite(apyBase) ? apyBase : null,
        apyReward: Number.isFinite(apyReward) ? apyReward : null,
        rewardTokens: apyReward > 0 ? [EV_TOKEN_ADDRESS] : [],
        underlyingTokens: [p.token0.id, p.token1.id],
        url: `${appUrl}/${p.id}`,
      };
    })
    .filter((p) => p !== null);
};

const apy = async () => {
  // allSettled so a single failing chain doesn't drop pools from healthy chains
  const results = await Promise.allSettled(
    Object.keys(CONFIG).map((chain) => getPoolsForChain(chain))
  );

  for (const r of results) {
    if (r.status === 'rejected') {
      console.error(
        'everything: chain fetch failed:',
        r.reason?.message || r.reason
      );
    }
  }

  return results
    .filter((r) => r.status === 'fulfilled')
    .flatMap((r) => r.value)
    .filter(utils.keepFinite);
};

module.exports = {
  protocolId: '7663',
  timetravel: false,
  apy,
  url: appUrl,
};
