const sdk = require('@defillama/sdk');
const axios = require('axios');
const utils = require('../utils');
const BigNumber = require('bignumber.js');

const CHAIN = 'monad';
const PROJECT = 'monday-trade-spot';
const FACTORY = '0xC1e98D0A2a58fB8aBd10ccc30a58efff4080Aa21';

// Time constants
const SECONDS_PER_DAY = 86400;
const DAYS_PER_YEAR = 365;
const APY_PERIOD_DAYS = 7;

// Fee tiers (in hundredths of a bip: 100=0.01%, 300=0.03%, 500=0.05%, 3000=0.3%, 10000=1%)
const FEE_TIERS = [100, 300, 500, 3000, 10000];

// Known tokens on Monad to scan for pairs
const KNOWN_TOKENS = [
  '0x3bd359C1119dA7Da1D913D1C4D2B7c461115433A', // WMON
  '0x754704Bc059F8C67012fEd69BC8A327a5aafb603', // USDC
  '0xe7cd86e13AC4309349F30B3435a9d337750fC82D', // USDT
  '0xEE8c0E9f1BFFb4Eb878d8f15f368A02a35481242', // WETH
  '0x0555E30da8f98308EdB960aa94C0Db47230d2B9c', // WBTC
  '0x10Aeaf63194db8d453d4D85a06E5eFE1dd0b5417', // wstETH
  '0xA3D68b74bF0528fdD07263c60d6488749044914b', // weETH
  '0x00000000eFE302BEAA2b3e6e1b18d08D69a9012a', // AUSD
  '0x103222f020e98bba0ad9809a011fdf8e6f067496', // earnAUSD
  '0xecAc9C5F704e954931349Da37F60E39f515c11c1', // LBTC
];

// ABIs
const ABI = {
  getPool:
    'function getPool(address tokenA, address tokenB, uint24 fee) view returns (address)',
  token0: 'address:token0',
  token1: 'address:token1',
  feeGrowthGlobal0X128: 'uint256:feeGrowthGlobal0X128',
  feeGrowthGlobal1X128: 'uint256:feeGrowthGlobal1X128',
  liquidity: 'uint128:liquidity',
  decimals: 'erc20:decimals',
  symbol: 'erc20:symbol',
  balanceOf: 'erc20:balanceOf',
};

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

// Get block number for a timestamp via DefiLlama API
const getBlock = async (timestamp) => {
  const { data } = await axios.get(
    `https://coins.llama.fi/block/${CHAIN}/${timestamp}`
  );
  return data.height;
};

// Get token metadata with caching
const tokenCache = new Map();
const getTokenMeta = async (address) => {
  const key = address.toLowerCase();
  if (tokenCache.has(key)) return tokenCache.get(key);

  try {
    const [decimalsRes, symbolRes] = await Promise.all([
      sdk.api.abi.call({ target: address, abi: ABI.decimals, chain: CHAIN }),
      sdk.api.abi.call({ target: address, abi: ABI.symbol, chain: CHAIN }),
    ]);
    const meta = {
      decimals: Number(decimalsRes.output),
      symbol: symbolRes.output,
    };
    tokenCache.set(key, meta);
    return meta;
  } catch {
    const fallback = { decimals: 18, symbol: 'UNKNOWN' };
    tokenCache.set(key, fallback);
    return fallback;
  }
};

// Discover pools by querying factory for all token pair + fee tier combinations
const discoverPools = async () => {
  const pools = new Map();

  for (let i = 0; i < KNOWN_TOKENS.length; i++) {
    for (let j = i + 1; j < KNOWN_TOKENS.length; j++) {
      for (const fee of FEE_TIERS) {
        try {
          const poolRes = await sdk.api.abi.call({
            target: FACTORY,
            abi: ABI.getPool,
            params: [KNOWN_TOKENS[i], KNOWN_TOKENS[j], fee],
            chain: CHAIN,
          });

          const poolAddr = poolRes.output?.toLowerCase();
          if (!poolAddr || poolAddr === ZERO_ADDRESS || pools.has(poolAddr))
            continue;

          // Get actual token order from pool
          const [t0Res, t1Res] = await Promise.all([
            sdk.api.abi.call({ target: poolAddr, abi: ABI.token0, chain: CHAIN }),
            sdk.api.abi.call({ target: poolAddr, abi: ABI.token1, chain: CHAIN }),
          ]);

          const token0 = t0Res.output.toLowerCase();
          const token1 = t1Res.output.toLowerCase();

          const [meta0, meta1] = await Promise.all([
            getTokenMeta(token0),
            getTokenMeta(token1),
          ]);

          pools.set(poolAddr, {
            address: poolAddr,
            token0,
            token1,
            fee,
            decimals0: meta0.decimals,
            decimals1: meta1.decimals,
            symbol0: meta0.symbol,
            symbol1: meta1.symbol,
          });
        } catch {
          // Pool doesn't exist for this combination
        }
      }
    }
  }

  return [...pools.values()];
};

// Get pool TVL
const getPoolTvl = async (pool, prices) => {
  const [bal0Res, bal1Res] = await Promise.all([
    sdk.api.abi.call({
      target: pool.token0,
      abi: ABI.balanceOf,
      params: [pool.address],
      chain: CHAIN,
    }),
    sdk.api.abi.call({
      target: pool.token1,
      abi: ABI.balanceOf,
      params: [pool.address],
      chain: CHAIN,
    }),
  ]);

  const price0 = prices.pricesByAddress[pool.token0] || 0;
  const price1 = prices.pricesByAddress[pool.token1] || 0;

  const tvl0 = BigNumber(bal0Res.output)
    .div(BigNumber(10).pow(pool.decimals0))
    .times(price0);
  const tvl1 = BigNumber(bal1Res.output)
    .div(BigNumber(10).pow(pool.decimals1))
    .times(price1);

  return tvl0.plus(tvl1);
};

// Get fee growth data at a specific block
const getFeeGrowth = async (poolAddress, block) => {
  const [fg0Res, fg1Res, liqRes] = await Promise.all([
    sdk.api.abi.call({
      target: poolAddress,
      abi: ABI.feeGrowthGlobal0X128,
      chain: CHAIN,
      block,
    }),
    sdk.api.abi.call({
      target: poolAddress,
      abi: ABI.feeGrowthGlobal1X128,
      chain: CHAIN,
      block,
    }),
    sdk.api.abi.call({
      target: poolAddress,
      abi: ABI.liquidity,
      chain: CHAIN,
      block,
    }),
  ]);

  return {
    feeGrowth0: BigInt(fg0Res.output),
    feeGrowth1: BigInt(fg1Res.output),
    liquidity: BigInt(liqRes.output),
  };
};

// Calculate APY from fee growth over period using BigNumber for precision
const calculateApy = async (pool, blockNow, blockAgo, prices, tvlUsd) => {
  try {
    const [dataNow, dataAgo] = await Promise.all([
      getFeeGrowth(pool.address, blockNow),
      getFeeGrowth(pool.address, blockAgo),
    ]);

    if (dataNow.liquidity === 0n) return 0;

    // Calculate fees in BigInt first (Q128 fixed-point math)
    const Q128 = 2n ** 128n;
    const fees0BigInt =
      ((dataNow.feeGrowth0 - dataAgo.feeGrowth0) * dataNow.liquidity) / Q128;
    const fees1BigInt =
      ((dataNow.feeGrowth1 - dataAgo.feeGrowth1) * dataNow.liquidity) / Q128;

    // Convert to BigNumber for precise decimal arithmetic
    const fees0 = BigNumber(fees0BigInt.toString());
    const fees1 = BigNumber(fees1BigInt.toString());

    const price0 = BigNumber(prices.pricesByAddress[pool.token0] || 0);
    const price1 = BigNumber(prices.pricesByAddress[pool.token1] || 0);

    const fees0Usd = fees0
      .div(BigNumber(10).pow(pool.decimals0))
      .times(price0);
    const fees1Usd = fees1
      .div(BigNumber(10).pow(pool.decimals1))
      .times(price1);

    const feesUsd = fees0Usd.plus(fees1Usd);

    const tvl = BigNumber(tvlUsd);
    if (tvl.lte(0)) return 0;

    // APY = (feesUsd / periodDays) * 365 * 100 / tvl
    const apyBase = feesUsd
      .div(APY_PERIOD_DAYS)
      .times(DAYS_PER_YEAR)
      .times(100)
      .div(tvl);

    return apyBase.toNumber();
  } catch (e) {
    console.error(`APY calc error for ${pool.address}:`, String(e.message || e));
    return 0;
  }
};

const apy = async () => {
  try {
    const pools = await discoverPools();
    if (!pools.length) return [];

    const now = Math.floor(Date.now() / 1000);
    const [blockNow, blockAgo] = await Promise.all([
      getBlock(now),
      getBlock(now - SECONDS_PER_DAY * APY_PERIOD_DAYS),
    ]);

    const allTokens = [...new Set(pools.flatMap((p) => [p.token0, p.token1]))];
    const prices = await utils.getPrices(allTokens, CHAIN);

    const results = [];

    for (const pool of pools) {
      const price0 = prices.pricesByAddress[pool.token0];
      const price1 = prices.pricesByAddress[pool.token1];
      if (!price0 || !price1) continue;

      const tvl = await getPoolTvl(pool, prices);

      const tvlUsd = tvl.toNumber();
      const apyBase = await calculateApy(
        pool,
        blockNow,
        blockAgo,
        prices,
        tvlUsd
      );

      results.push({
        pool: pool.address,
        chain: utils.formatChain(CHAIN),
        project: PROJECT,
        poolMeta: `${pool.fee / 1e4}%`,
        symbol: utils.formatSymbol(`${pool.symbol0}-${pool.symbol1}`),
        tvlUsd,
        apyBase,
        underlyingTokens: [pool.token0, pool.token1],
        url: `https://app.monday.trade/#/spot/liquidity/monad/${pool.address}/${pool.symbol0}-${pool.symbol1}`,
      });
    }

    return results.sort((a, b) => b.tvlUsd - a.tvlUsd);
  } catch (e) {
    console.error('Error fetching Monday Trade Spot pools:', e);
    return [];
  }
};

module.exports = {
  apy,
  url: 'https://app.monday.trade',
};
