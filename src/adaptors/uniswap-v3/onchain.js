const sdk = require('@defillama/sdk');
const utils = require('../utils');
const { getUniqueAddresses } = require('@defillama/sdk/build/generalUtil');
const BigNumber = require('bignumber.js');

const chains = {
  bob: {
    factory: '0xcb2436774C3e191c85056d248EF4260ce5f27A9D',
    fromBlock: 5188280,
    blockTime: 2,
    ui: 'oku',
  },
  monad: {
    factory: '0x204faca1764b154221e35c0d20abb3c525710498',
    fromBlock: 29255827,
    blockTime: 0.4,
    ui: 'uniswap',
  },
};

const EVENTS = {
  PoolCreated: 'event PoolCreated(address indexed token0, address indexed token1, uint24 indexed fee, int24 tickSpacing, address pool)',
  Swap: 'event Swap(address indexed sender, address indexed recipient, int256 amount0, int256 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick)',
};

const CONCURRENT_POOL_SCANS = 5;

const sumSwapUsd = (swapLogs, pool, tokenDecimals, prices) => {
  const toUsd = (amount, token) =>
    BigNumber(amount)
      .times(10 ** (18 - tokenDecimals[token]))
      .times(prices.pricesByAddress[token])
      .div(1e18);

  const sumValues = (values) =>
    values.reduce((total, value) => total + value, 0n);

  const amounts0 = swapLogs
    .map((log) => BigInt(log.args.amount0))
    .filter((amount) => amount > 0n);
  const amounts1 = swapLogs
    .map((log) => BigInt(log.args.amount1))
    .filter((amount) => amount > 0n);

  const fees0 = sumValues(
    amounts0.map((amount) => (amount * pool.fee) / 1_000_000n)
  );
  const fees1 = sumValues(
    amounts1.map((amount) => (amount * pool.fee) / 1_000_000n)
  );

  return {
    feeUsd: toUsd(fees0, pool.token0).plus(toUsd(fees1, pool.token1)),
    volumeUsd: toUsd(sumValues(amounts0), pool.token0).plus(
      toUsd(sumValues(amounts1), pool.token1)
    ),
  };
};

const getPricesChunked = async (tokens, chain) => {
  const pricesByAddress = {};
  const pricesBySymbol = {};

  for (let start = 0; start < tokens.length; start += 50) {
    const prices = await utils.getPrices(tokens.slice(start, start + 50), chain);
    Object.assign(pricesByAddress, prices.pricesByAddress);
    Object.assign(pricesBySymbol, prices.pricesBySymbol);
  }

  return { pricesByAddress, pricesBySymbol };
};

const getPools = async (chain) => {
  const config = chains[chain];
  const dataPools = [];

  const currentBlock = await sdk.api.util.getLatestBlock(chain);

  const poolCreatedLogs = await sdk.getEventLogs({
    chain,
    target: config.factory,
    eventAbi: EVENTS.PoolCreated,
    fromBlock: config.fromBlock,
    toBlock: currentBlock.number,
  });

  const seenPools = new Set();
  const pools = poolCreatedLogs
    .map((log) => ({
      token0: log.args.token0.toLowerCase(),
      token1: log.args.token1.toLowerCase(),
      address: log.args.pool.toLowerCase(),
      fee: BigInt(log.args.fee),
    }))
    .filter((p) => !seenPools.has(p.address) && seenPools.add(p.address));

  const tokens = getUniqueAddresses(
    pools.map((p) => p.token0).concat(pools.map((p) => p.token1))
  );
  const prices = await getPricesChunked(tokens, chain);

  const tokenDecimals = Object.fromEntries(
    (
      await sdk.api.abi.multiCall({
        abi: 'erc20:decimals',
        calls: tokens.map((t) => ({
          target: t,
          params: [],
        })),
        chain,
        permitFailure: true,
      })
    ).output.map((o) => [o.input.target, Number(o.output)])
  );

  const tokenSymbols = Object.fromEntries(
    (
      await sdk.api.abi.multiCall({
        abi: 'erc20:symbol',
        calls: tokens.map((t) => ({
          target: t,
          params: [],
        })),
        chain,
        permitFailure: true,
      })
    ).output.map((o) => [o.input.target, o.output])
  );

  const token0Balances = await sdk.api.abi.multiCall({
    abi: 'erc20:balanceOf',
    calls: pools.map((p) => ({
      target: p.token0,
      params: [p.address],
    })),
    chain,
    permitFailure: true,
  });
  const token1Balances = await sdk.api.abi.multiCall({
    abi: 'erc20:balanceOf',
    calls: pools.map((p) => ({
      target: p.token1,
      params: [p.address],
    })),
    chain,
    permitFailure: true,
  });

  pools.forEach((p, i) => {
    pools[i].balance0 = BigNumber(token0Balances.output[i].output);
    pools[i].balance1 = BigNumber(token1Balances.output[i].output);
  });

  const pricedPools = [];
  for (const pool of pools) {
    if (
      !prices.pricesByAddress[pool.token0] ||
      !prices.pricesByAddress[pool.token1]
    ) {
      continue;
    }

    const tvl0 = pool.balance0
      .times(10 ** (18 - tokenDecimals[pool.token0]))
      .times(prices.pricesByAddress[pool.token0])
      .div(1e18);
    const tvl1 = pool.balance1
      .times(10 ** (18 - tokenDecimals[pool.token1]))
      .times(prices.pricesByAddress[pool.token1])
      .div(1e18);

    const tvl = tvl0.plus(tvl1);

    // skip dust pools before the expensive per-pool swap log scans
    if (!(tvl.toNumber() >= utils.MIN_TVL_USD)) {
      continue;
    }

    pricedPools.push({ ...pool, tvl });
  }

  const blocksPerDay = (24 * 3600) / config.blockTime;

  const scanPool = async (pool) => {
    const swapLogs = await sdk.getEventLogs({
      chain,
      target: pool.address,
      eventAbi: EVENTS.Swap,
      fromBlock: currentBlock.number - blocksPerDay,
      toBlock: currentBlock.number,
    });

    const totals = sumSwapUsd(swapLogs, pool, tokenDecimals, prices);
    const apr = totals.feeUsd.div(pool.tvl).times(100).times(365);

    const poolMeta = `${Number(pool.fee) / 1e4}%`;

    return {
      pool: pool.address,
      chain,
      project: 'uniswap-v3',
      poolMeta,
      symbol: [tokenSymbols[pool.token0], tokenSymbols[pool.token1]].join('-'),
      tvlUsd: pool.tvl.toNumber(),
      apyBase: utils.aprToApy(apr.toNumber()),
      underlyingTokens: [pool.token0, pool.token1],
      url:
        config.ui === 'oku'
          ? `https://oku.trade/app/${chain}/liquidity/${pool.address}`
          : `https://app.uniswap.org/#/add/${pool.token0}/${pool.token1}/${pool.fee}?chain=${chain}`,
      volumeUsd1d: totals.volumeUsd.toNumber(),
    };
  };

  const scanQueue = [...pricedPools];
  const runScanWorker = async () => {
    while (scanQueue.length > 0) {
      dataPools.push(await scanPool(scanQueue.shift()));
    }
  };
  await Promise.all(
    Array.from({ length: CONCURRENT_POOL_SCANS }, runScanWorker)
  );

  return dataPools;
};

const getOnchainPools = async () => {
  const data = [];
  for (const chain of Object.keys(chains)) {
    console.log(chain);
    data.push(await getPools(chain));
  }
  return data.flat();
};

module.exports = getOnchainPools;
