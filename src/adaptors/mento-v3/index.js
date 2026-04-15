const sdk = require('@defillama/sdk');
const utils = require('../utils');
const { addMerklRewardApy } = require('../merkl/merkl-additional-reward');

const PROJECT = 'mento-v3';
const FPMM_FACTORY = '0xa849b475FE5a4B5C9C3280152c7a1945b907613b';
const CHAINS = ['monad', 'celo'];

// Swap(address indexed sender, uint256 amount0In, uint256 amount1In, uint256 amount0Out, uint256 amount1Out, address indexed to)
const SWAP_TOPIC =
  '0xd78ad95fa46c994b6551d0da85fc275fe613ce37657fb8d5e3d130840159d822';

const getSwapVolume7d = async (poolAddr, chain, token0Dec, token1Dec, price0, price1) => {
  try {
    const now = Math.floor(Date.now() / 1000);
    const logs = await sdk.getEventLogs({
      target: poolAddr,
      topics: [SWAP_TOPIC],
      chain,
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

const getChainPools = async (chain) => {
  // Fetch all pool addresses from factory
  const { output: poolAddresses } = await sdk.api.abi.call({
    target: FPMM_FACTORY,
    abi: 'address[]:deployedFPMMAddresses',
    chain,
  });

  if (!poolAddresses.length) return [];

  const calls = poolAddresses.map((a) => ({ target: a }));

  // Token metadata (decimals, symbols) is fetched separately after resolving token addresses
  const [token0s, token1s, reserves, lpFees] = await Promise.all([
    sdk.api.abi.multiCall({ calls, chain, abi: 'address:token0' }),
    sdk.api.abi.multiCall({ calls, chain, abi: 'address:token1' }),
    sdk.api.abi.multiCall({ calls, chain, abi: 'function getReserves() view returns (uint256, uint256)' }),
    sdk.api.abi.multiCall({ calls, chain, abi: 'function lpFee() view returns (uint256)' }),
  ]);

  const t0Addrs = token0s.output.map((o) => o.output);
  const t1Addrs = token1s.output.map((o) => o.output);
  const allTokens = [...new Set([...t0Addrs, ...t1Addrs])];

  const [decResults, symResults] = await Promise.all([
    sdk.api.abi.multiCall({ calls: allTokens.map((a) => ({ target: a })), chain, abi: 'erc20:decimals' }),
    sdk.api.abi.multiCall({ calls: allTokens.map((a) => ({ target: a })), chain, abi: 'erc20:symbol' }),
  ]);

  const decMap = {};
  const symMap = {};
  allTokens.forEach((a, i) => {
    decMap[a.toLowerCase()] = Number(decResults.output[i]?.output || 18);
    symMap[a.toLowerCase()] = symResults.output[i]?.output || 'UNKNOWN';
  });

  const coins = allTokens.map((t) => `${chain}:${t}`);
  const prices = (await utils.getPrices(coins)).pricesByAddress;

  const result = [];
  for (let i = 0; i < poolAddresses.length; i++) {
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

    const volume7d = await getSwapVolume7d(
      poolAddresses[i], chain, dec0, dec1, price0, price1
    );
    const feeRate = lpFeeBps / 10000;
    const apyBase =
      tvlUsd > 0 ? ((volume7d * feeRate) / 7) * 365 * (100 / tvlUsd) : null;

    result.push({
      pool: `${poolAddresses[i]}-${chain}`.toLowerCase(),
      chain: utils.formatChain(chain),
      project: PROJECT,
      symbol: `${sym0}-${sym1}`,
      tvlUsd,
      apyBase,
      underlyingTokens: [t0, t1],
      url: `https://app.mento.org/pools/${chain}/${poolAddresses[i]}`,
    });
  }

  return result;
};

const apy = async () => {
  const results = await Promise.all(CHAINS.map(getChainPools));
  const pools = results.flat();

  const withRewards = await addMerklRewardApy(pools, 'mento', (p) =>
    p.pool.split('-')[0]
  );
  return withRewards.filter((p) => utils.keepFinite(p));
};

module.exports = {
  timetravel: false,
  apy,
  url: 'https://app.mento.org/',
};
