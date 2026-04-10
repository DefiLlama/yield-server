const sdk = require('@defillama/sdk');
const utils = require('../utils');
const { addMerklRewardApy } = require('../merkl/merkl-additional-reward');

const CHAIN = 'monad';
const PROJECT = 'mento';

// Swap(address indexed sender, uint256 amount0In, uint256 amount1In, uint256 amount0Out, uint256 amount1Out, address indexed to)
const SWAP_TOPIC =
  '0xd78ad95fa46c994b6551d0da85fc275fe613ce37657fb8d5e3d130840159d822';

// Mento FPMM pool addresses on Monad
const POOL_ADDRESSES = [
  '0xD0E9c1a718D2a693d41eacd4B2696180403Ce081', // GBPm-USDm
  '0x463c0d1F04bcd99A1efCF94AC2a75bc19Ea4A7E5', // USDC-USDm
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
      const amount0In =
        Number(BigInt('0x' + data.slice(0, 64))) / 10 ** token0Dec;
      const amount1In =
        Number(BigInt('0x' + data.slice(64, 128))) / 10 ** token1Dec;
      volumeUsd += amount0In * (price0 || 0) + amount1In * (price1 || 0);
    }
    return volumeUsd;
  } catch {
    return 0;
  }
};

const apy = async () => {
  // Fetch pool metadata on-chain
  const [token0s, token1s, reserves, lpFees, token0Decs, token1Decs, token0Syms, token1Syms] =
    await Promise.all([
      sdk.api.abi.multiCall({ calls: POOL_ADDRESSES.map((a) => ({ target: a })), chain: CHAIN, abi: 'address:token0' }),
      sdk.api.abi.multiCall({ calls: POOL_ADDRESSES.map((a) => ({ target: a })), chain: CHAIN, abi: 'address:token1' }),
      sdk.api.abi.multiCall({ calls: POOL_ADDRESSES.map((a) => ({ target: a })), chain: CHAIN, abi: 'function getReserves() view returns (uint256, uint256)' }),
      sdk.api.abi.multiCall({ calls: POOL_ADDRESSES.map((a) => ({ target: a })), chain: CHAIN, abi: 'function lpFee() view returns (uint256)' }),
      // Will be filled after we know token addresses
      null, null, null, null,
    ]);

  // Get token metadata
  const t0Addrs = token0s.output.map((o) => o.output);
  const t1Addrs = token1s.output.map((o) => o.output);
  const allTokens = [...new Set([...t0Addrs, ...t1Addrs])];

  const [decResults, symResults] = await Promise.all([
    sdk.api.abi.multiCall({ calls: allTokens.map((a) => ({ target: a })), chain: CHAIN, abi: 'erc20:decimals' }),
    sdk.api.abi.multiCall({ calls: allTokens.map((a) => ({ target: a })), chain: CHAIN, abi: 'erc20:symbol' }),
  ]);

  const decMap = {};
  const symMap = {};
  allTokens.forEach((a, i) => {
    decMap[a.toLowerCase()] = Number(decResults.output[i]?.output || 18);
    symMap[a.toLowerCase()] = symResults.output[i]?.output || 'UNKNOWN';
  });

  // Prices
  const coins = allTokens.map((t) => `${CHAIN}:${t}`);
  const prices = (await utils.getPrices(coins)).pricesByAddress;

  const result = [];
  for (let i = 0; i < POOL_ADDRESSES.length; i++) {
    const t0 = t0Addrs[i];
    const t1 = t1Addrs[i];
    const [reserve0, reserve1] = reserves.output[i].output;
    const lpFeeBps = Number(lpFees.output[i].output);

    const dec0 = decMap[t0.toLowerCase()];
    const dec1 = decMap[t1.toLowerCase()];
    const sym0 = symMap[t0.toLowerCase()];
    const sym1 = symMap[t1.toLowerCase()];
    const price0 = prices[t0.toLowerCase()];
    const price1 = prices[t1.toLowerCase()];

    const tvl0 = price0 ? (Number(reserve0) / 10 ** dec0) * price0 : 0;
    const tvl1 = price1 ? (Number(reserve1) / 10 ** dec1) * price1 : 0;
    const tvlUsd = tvl0 + tvl1;

    // Base APY from 7d swap volume and LP fee
    const volume7d = await getSwapVolume7d(
      POOL_ADDRESSES[i], dec0, dec1, price0, price1
    );
    const feeRate = lpFeeBps / 10000;
    const apyBase =
      tvlUsd > 0 ? ((volume7d * feeRate) / 7) * 365 * (100 / tvlUsd) : null;

    result.push({
      pool: `${POOL_ADDRESSES[i]}-${CHAIN}`.toLowerCase(),
      chain: utils.formatChain(CHAIN),
      project: PROJECT,
      symbol: `${sym0}-${sym1}`,
      tvlUsd,
      apyBase,
      underlyingTokens: [t0, t1],
      url: `https://app.mento.org/pools/monad/${POOL_ADDRESSES[i]}`,
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
