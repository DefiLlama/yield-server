const sdk = require('@defillama/sdk');
const utils = require('../utils');

const PROJECT = 'fynd-amm';
const EKUBO_API_URL = 'https://prod-api.ekubo.org';

// Fynd AMM pools are Ekubo v3 pools that use Fynd's SignedExclusiveSwap extension.
// Core and the extension share their addresses on every chain.
const CORE = '0x00000000000014aA86C5d3c41765bb24e11bd701';
const EXTENSION_V1 = '0x55b703eED01b35641963da2FB2E14885993605A3';
const EXTENSION = '0x550CFe1292d0D9c0d28f232b3F42Edb4439B1D09';

// LPs hold their positions through Ekubo's Positions contract, which keeps a protocol share of collected swap fees.
const POSITIONS = '0x02D9876A21AF7545f8632C3af76eC90b5ad4b66D';
const POSITIONS_192_BIT_IDS = '0xA2971E0C37cFdb13aE8440A0C94Ef1A1af39e326';

// fromBlock is the block in which the first Fynd AMM pool was initialized on that chain.
const CONFIG = {
  ethereum: {
    chainId: 1,
    extensions: [EXTENSION_V1, EXTENSION],
    positions: POSITIONS,
    fromBlock: 25689059,
  },
  robinhood: {
    chainId: 4663,
    extensions: [EXTENSION],
    positions: POSITIONS,
    fromBlock: 72277109,
  },
  base: {
    chainId: 8453,
    extensions: [EXTENSION],
    positions: POSITIONS,
    fromBlock: 53151641,
  },
  bsc: {
    chainId: 56,
    extensions: [EXTENSION],
    positions: POSITIONS_192_BIT_IDS,
    fromBlock: 130064169,
  },
};

// Test pools that are not listed in the Fynd app.
const EXCLUDED_POOLS = new Set([
  '0x22c2b655277ac0d151ab5844d49f3ddf6118e555e35be89d3cf3f476647af38b', // ethereum USDC/WETH
  '0x29936f43df20cce7583ff081144b26fc8984cd38d3f413f04695640928729524', // robinhood USDG/UBIK
  '0xf893e7a59d7645501877e680332860a61f784332e7e722a5e9bb9a8cbad38656', // robinhood SPY/USDG
]);

// The Fynd app shows no APR for pools below this TVL.
const MIN_TVL_USD = 1000;

const abis = {
  poolInitialized:
    'event PoolInitialized(bytes32 poolId, (address token0, address token1, bytes32 config) poolKey, int32 tick, uint96 sqrtRatio)',
  swapProtocolFee: 'function SWAP_PROTOCOL_FEE_X64() view returns (uint64)',
};

// The Ekubo API names the native token 0x0.
const apiToken = (token) => (BigInt(token) === 0n ? '0x0' : token);

const getChainPools = async (chain) => {
  const { chainId, extensions, positions, fromBlock } = CONFIG[chain];
  const extensionSet = new Set(extensions.map((e) => BigInt(e)));
  const toBlock = (await sdk.api.util.getLatestBlock(chain)).number;

  // The top 20 bytes of a pool config are its extension, so this finds every Fynd AMM pool on-chain.
  const initialized = await sdk.getEventLogs({
    chain,
    target: CORE,
    eventAbi: abis.poolInitialized,
    fromBlock,
    toBlock,
    onlyArgs: true,
  });
  const pools = initialized
    .filter(
      ({ poolId, poolKey }) =>
        extensionSet.has(BigInt(poolKey.config) >> 96n) &&
        !EXCLUDED_POOLS.has(poolId.toLowerCase())
    )
    .map(({ poolId, poolKey }) => ({
      poolId: poolId.toLowerCase(),
      token0: poolKey.token0.toLowerCase(),
      token1: poolKey.token1.toLowerCase(),
    }));
  if (!pools.length) return [];

  const { output: protocolFeeX64 } = await sdk.api.abi.call({
    chain,
    target: positions,
    abi: abis.swapProtocolFee,
  });
  const lpFeeShare = 1 - Number(protocolFeeX64) / 2 ** 64;

  const tokens = [...new Set(pools.flatMap((p) => [p.token0, p.token1]))];
  const coins = await utils.getPriceApiCoins(
    tokens.map((token) => `${chain}:${token}`)
  );

  const result = [];
  for (const pool of pools) {
    const coin0 = coins[`${chain}:${pool.token0}`];
    const coin1 = coins[`${chain}:${pool.token1}`];
    if (!coin0 || !coin1) continue;
    const toUsd = (amount0, amount1) =>
      (Number(amount0) / 10 ** coin0.decimals) * coin0.price +
      (Number(amount1) / 10 ** coin1.decimals) * coin1.price;

    // Ekubo's pool list gives the pool's TVL and its depth: the liquidity within `depth_percent` of the price,
    // which is the liquidity that earns fees. Its volume endpoint gives the pool's LP fees over the last 24 hours.
    // The extension keeps Fynd's owner fee before the fees reach the pool, so these are the LPs' fees.
    const pairUrl = `${EKUBO_API_URL}/pair/${chainId}/${apiToken(
      pool.token0
    )}/${apiToken(pool.token1)}`;
    const { topPools } = await utils.getData(`${pairUrl}/pools?minTvlUsd=0`);
    const row = topPools.find((p) => BigInt(p.pool_id) === BigInt(pool.poolId));
    if (!row) continue;
    const { volumeByToken_24h } = await utils.getData(
      `${pairUrl}/volume?poolId=${pool.poolId}&coreAddress=${CORE}`
    );
    const fees = Object.fromEntries(
      volumeByToken_24h.map(({ token, fees }) => [BigInt(token), fees])
    );

    const tvlUsd = toUsd(row.tvl0_total, row.tvl1_total);
    const depthUsd = toUsd(row.depth0, row.depth1);
    if (tvlUsd < MIN_TVL_USD || !depthUsd) continue;
    const feesUsd =
      toUsd(fees[BigInt(pool.token0)] ?? 0, fees[BigInt(pool.token1)] ?? 0) *
      lpFeeShare;

    result.push({
      pool: `${PROJECT}-${chain}-${pool.poolId}`,
      chain: utils.formatChain(chain),
      project: PROJECT,
      symbol: `${coin0.symbol}-${coin1.symbol}`,
      tvlUsd,
      // APR on the liquidity near the price, net of the Ekubo protocol fee.
      apyBase: ((feesUsd * 365) / depthUsd) * 100,
      underlyingTokens: [pool.token0, pool.token1],
      poolMeta:
        row.depth_percent != null
          ? `CL range ${(row.depth_percent * 100).toFixed(2)}%`
          : null,
      // Positions are Ekubo NFTs, so the pool has no fungible token.
      token: null,
    });
  }
  return result;
};

// A failing chain (e.g. an RPC that rejects the log query) must not drop the pools of the other chains.
const apy = async () => {
  const chains = Object.keys(CONFIG);
  const results = await Promise.allSettled(chains.map(getChainPools));
  const pools = results.flatMap((r, i) => {
    if (r.status === 'fulfilled') return r.value;
    console.error(
      `${PROJECT}: ${chains[i]} failed: ${
        r.reason?.message ?? JSON.stringify(r.reason)
      }`
    );
    return [];
  });
  return pools.filter((p) => utils.keepFinite(p));
};

module.exports = {
  protocolId: '9267',
  timetravel: false,
  apy,
  url: 'https://swap.fynd.xyz/pools',
};
