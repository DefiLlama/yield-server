const sdk = require('@defillama/sdk');
const utils = require('../utils');
const { addMerklRewardApy } = require('../merkl/merkl-additional-reward');

const CHAIN = 'monad';
const PROJECT = 'mento';

// Swap(address indexed sender, uint256 amount0In, uint256 amount1In, uint256 amount0Out, uint256 amount1Out, address indexed to)
const SWAP_TOPIC =
  '0xd78ad95fa46c994b6551d0da85fc275fe613ce37657fb8d5e3d130840159d822';

const pools = [
  {
    address: '0xD0E9c1a718D2a693d41eacd4B2696180403Ce081',
    token0: '0x39bb4E0a204412bB98e821d25e7d955e69d40Fd1', // GBPm
    token1: '0xBC69212B8E4d445b2307C9D32dD68E2A4Df00115', // USDm
    symbol: 'GBPm-USDm',
    token0Decimals: 18,
    token1Decimals: 18,
  },
  {
    address: '0x463c0d1F04bcd99A1efCF94AC2a75bc19Ea4A7E5',
    token0: '0x754704Bc059F8C67012fEd69BC8A327a5aafb603', // USDC
    token1: '0xBC69212B8E4d445b2307C9D32dD68E2A4Df00115', // USDm
    symbol: 'USDC-USDm',
    token0Decimals: 6,
    token1Decimals: 18,
  },
];

const getSwapVolume7d = async (poolAddr, token0Dec, token1Dec, price0, price1) => {
  try {
    const now = Math.floor(Date.now() / 1000);
    const logs = await sdk.getEventLogs({
      target: poolAddr,
      topics: [SWAP_TOPIC],
      chain: CHAIN,
      entireLog: true,
      fromTimestamp: now - 7 * 86400,
      toTimestamp: now,
      flatten: true,
    });

    let volumeUsd = 0;
    for (const log of logs || []) {
      const data = log.data.slice(2);
      const amount0In = Number(BigInt('0x' + data.slice(0, 64))) / 10 ** token0Dec;
      const amount1In = Number(BigInt('0x' + data.slice(64, 128))) / 10 ** token1Dec;
      volumeUsd += amount0In * (price0 || 0) + amount1In * (price1 || 0);
    }
    return volumeUsd;
  } catch {
    return 0;
  }
};

const apy = async () => {
  const [reserveResults, feeResults] = await Promise.all([
    sdk.api.abi.multiCall({
      calls: pools.map((p) => ({ target: p.address })),
      chain: CHAIN,
      abi: 'function getReserves() view returns (uint256, uint256)',
    }),
    sdk.api.abi.multiCall({
      calls: pools.map((p) => ({ target: p.address })),
      chain: CHAIN,
      abi: 'function lpFee() view returns (uint256)',
    }),
  ]);

  const allTokens = pools.flatMap((p) => [p.token0, p.token1]);
  const coins = [...new Set(allTokens)].map((t) => `${CHAIN}:${t}`);
  const prices = (await utils.getPrices(coins)).pricesByAddress;

  const result = [];
  for (let i = 0; i < pools.length; i++) {
    const pool = pools[i];
    const [reserve0, reserve1] = reserveResults.output[i].output;
    const lpFeeBps = Number(feeResults.output[i].output);

    const price0 = prices[pool.token0.toLowerCase()];
    const price1 = prices[pool.token1.toLowerCase()];

    const tvl0 = price0
      ? (Number(reserve0) / 10 ** pool.token0Decimals) * price0
      : 0;
    const tvl1 = price1
      ? (Number(reserve1) / 10 ** pool.token1Decimals) * price1
      : 0;
    const tvlUsd = tvl0 + tvl1;

    // Calculate base APY from 7d swap volume and LP fee
    const volume7d = await getSwapVolume7d(
      pool.address,
      pool.token0Decimals,
      pool.token1Decimals,
      price0,
      price1
    );
    const feeRate = lpFeeBps / 10000;
    const apyBase =
      tvlUsd > 0 ? ((volume7d * feeRate) / 7) * 365 * (100 / tvlUsd) : null;

    result.push({
      pool: `${pool.address}-${CHAIN}`.toLowerCase(),
      chain: utils.formatChain(CHAIN),
      project: PROJECT,
      symbol: pool.symbol,
      tvlUsd,
      apyBase,
      underlyingTokens: [pool.token0, pool.token1],
      url: `https://app.mento.org/pools/monad/${pool.address}`,
    });
  }

  const withRewards = await addMerklRewardApy(result, 'mento', (p) =>
    p.pool.split('-')[0]
  );
  return withRewards.filter((p) => utils.keepFinite(p));
};

module.exports = {
  timetravel: false,
  apy,
  url: 'https://app.mento.org/',
};
