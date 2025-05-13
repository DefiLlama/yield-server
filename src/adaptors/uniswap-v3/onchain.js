const sdk = require('@defillama/sdk');
const utils = require('../utils');
const { ethers } = require('ethers');
const { getUniqueAddresses } = require('@defillama/sdk/build/generalUtil');
const BigNumber = require('bignumber.js');

const chains = {
  bob: {
    factory: '0xcb2436774C3e191c85056d248EF4260ce5f27A9D',
    fromBlock: 5188280,
    blockTime: 2,
    ui: 'oku',
  },
};

const SwapInterface = new ethers.utils.Interface([
  'event Swap(address indexed sender, address indexed recipient, int256 amount0, int256 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick)',
]);

const getPools = async (chain) => {
  const config = chains[chain];
  const dataPools = [];

  const currentBlock = await sdk.api.util.getLatestBlock(chain);

  const poolCreatedLogs = await sdk.api.util.getLogs({
    chain,
    target: config.factory,
    topic: 'PoolCreated(address,address,uint24,int24,address)',
    keys: [],
    fromBlock: config.fromBlock,
    toBlock: currentBlock.number,
  });

  const pools = poolCreatedLogs.output.map((log) => ({
    token0: '0x' + log.topics[1].slice(-40),
    token1: '0x' + log.topics[2].slice(-40),
    address: '0x' + log.data.slice(-40),
    fee: BigInt(log.topics[3]),
  }));

  const tokens = getUniqueAddresses(
    pools.map((p) => p.token0).concat(pools.map((p) => p.token1))
  );
  const prices = await utils.getPrices(tokens, chain);

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

  for (const pool of pools) {
    if (
      !prices.pricesByAddress[pool.token0] ||
      !prices.pricesByAddress[pool.token1]
    ) {
      continue;
    }

    const swapLogs = await sdk.api.util.getLogs({
      chain,
      target: pool.address,
      topic: '',
      topics: [SwapInterface.getEventTopic('Swap')],
      keys: [],
      fromBlock: currentBlock.number - (24 * 3600) / config.blockTime,
      toBlock: currentBlock.number,
    });

    const parsedSwapLogs = swapLogs.output.map(
      (log) => SwapInterface.parseLog(log).args
    );

    const totalFee0 = parsedSwapLogs
      .map((log) => log.amount0.toBigInt())
      .filter((x) => x > 0n)
      .reduce((sum, x) => sum + (x * pool.fee) / 1_000_000n, 0n);
    const totalFee1 = parsedSwapLogs
      .map((log) => log.amount1.toBigInt())
      .filter((x) => x > 0n)
      .reduce((sum, x) => sum + (x * pool.fee) / 1_000_000n, 0n);

    const feeValue0 = BigNumber(totalFee0)
      .times(10 ** (18 - tokenDecimals[pool.token0]))
      .times(prices.pricesByAddress[pool.token0])
      .div(1e18);
    const feeValue1 = BigNumber(totalFee1)
      .times(10 ** (18 - tokenDecimals[pool.token1]))
      .times(prices.pricesByAddress[pool.token1])
      .div(1e18);

    const feeValue = feeValue0.plus(feeValue1);

    const totalVolume0 = parsedSwapLogs
      .map((log) => log.amount0.toBigInt())
      .filter((x) => x > 0n)
      .reduce((sum, x) => sum + x, 0n);
    const totalVolume1 = parsedSwapLogs
      .map((log) => log.amount1.toBigInt())
      .filter((x) => x > 0n)
      .reduce((sum, x) => sum + x, 0n);

    const volumeValue0 = BigNumber(totalVolume0)
      .times(10 ** (18 - tokenDecimals[pool.token0]))
      .times(prices.pricesByAddress[pool.token0])
      .div(1e18);
    const volumeValue1 = BigNumber(totalVolume1)
      .times(10 ** (18 - tokenDecimals[pool.token1]))
      .times(prices.pricesByAddress[pool.token1])
      .div(1e18);

    const volumeValue = volumeValue0.plus(volumeValue1);

    const tvl0 = pool.balance0
      .times(10 ** (18 - tokenDecimals[pool.token0]))
      .times(prices.pricesByAddress[pool.token0])
      .div(1e18);
    const tvl1 = pool.balance1
      .times(10 ** (18 - tokenDecimals[pool.token1]))
      .times(prices.pricesByAddress[pool.token1])
      .div(1e18);

    const tvl = tvl0.plus(tvl1);

    const apr = feeValue.div(tvl).times(100).times(365);
    const apy = utils.aprToApy(apr.toNumber());

    const poolMeta = `${Number(pool.fee) / 1e4}%`;

    dataPools.push({
      pool: pool.address,
      chain,
      project: 'uniswap-v3',
      poolMeta,
      symbol: [tokenSymbols[pool.token0], tokenSymbols[pool.token1]].join('-'),
      tvlUsd: tvl.toNumber(),
      apyBase: apy,
      underlyingTokens: [pool.token0, pool.token1],
      url:
        config.ui === 'oku'
          ? `https://oku.trade/app/${chain}/liquidity/${pool.address}`
          : `https://app.uniswap.org/#/add/${pool.token0}/${pool.token1}/${pool.fee}?chain=${chain}`,
      volumeUsd1d: volumeValue.toNumber(),
    });
  }

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
