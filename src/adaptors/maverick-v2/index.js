const superagent = require('superagent');
const ethers = require('ethers');
const sdk = require('@defillama/sdk');
const utils = require('../utils');

const PROJECT = 'maverick-v2';

const FactoryConfigs = {
  ethereum: {
    factory: '0x0A7e848Aca42d879EF06507Fca0E7b33A0a63c1e',
    fromBlock: 20027237,
  },
  // arbitrum: {
  //   factory: '0x0A7e848Aca42d879EF06507Fca0E7b33A0a63c1e',
  //   fromBlock: 219205178,
  // },
  // base: {
  //   factory: '0x0A7e848Aca42d879EF06507Fca0E7b33A0a63c1e',
  //   fromBlock: 15321282,
  // },
  // bsc: {
  //   factory: '0x0A7e848Aca42d879EF06507Fca0E7b33A0a63c1e',
  //   fromBlock: 39421941,
  // },
  // scroll: {
  //   factory: '0x0A7e848Aca42d879EF06507Fca0E7b33A0a63c1e',
  //   fromBlock: 7332349,
  // },
  // era: {
  //   factory: '0x7A6902af768a06bdfAb4F076552036bf68D1dc56',
  //   fromBlock: 35938168,
  // },
}

const EventPoolCreated = 'event PoolCreated(address poolAddress, uint8 protocolFeeRatio, uint256 feeAIn, uint256 feeBIn, uint256 tickSpacing, uint256 lookback, int32 activeTick, address tokenA, address tokenB, uint8 kinds, address accessor)';
const EventPoolSwap = 'event PoolSwap(address sender, address recipient, tuple(uint256 amount, bool tokenAIn, bool exactOutput, int32 tickLimit), uint256 amountIn, uint256 amountOut)';

function getPoolLink(chain, poolAddress) {
  let chainId = 1
  if (chain === 'arbitrum') chainId = 42161;
  if (chain === 'polygon') chainId = 137;
  if (chain === 'base') chainId = 42161;

  return `https://app.mav.xyz/pool/${poolAddress}?chain=${chainId}`;
}

async function fetchPools(chain, currentBlock) {
  const events = await sdk.getEventLogs({
    chain: chain,
    eventAbi: EventPoolCreated,
    target: FactoryConfigs[chain].factory,
    fromBlock: FactoryConfigs[chain].fromBlock,
    toBlock: currentBlock,
  });

  const pools = {};
  for (const event of events) {
    const poolAddress = utils.formatAddress(event.args.poolAddress);
    pools[poolAddress] = {
      pool: poolAddress,
      token0Address: utils.formatAddress(event.args.tokenA),
      token1Address: utils.formatAddress(event.args.tokenB),
      fee0In: Number(event.args.feeAIn) / 1e18,
      fee1In: Number(event.args.feeBIn) / 1e18,
    }
  }

  return pools;
}

const main = async (unixTimestamp) => {
  const yieldPools = []

  const timestamp = unixTimestamp ? unixTimestamp : Math.floor(new Date().getTime() / 1000);
  const currentBlocks = await sdk.blocks.getBlocks(timestamp, Object.keys(FactoryConfigs));
  const last1DaysBlocks = await sdk.blocks.getBlocks(timestamp - 24 * 60 * 60, Object.keys(FactoryConfigs));
  const last7DaysBlocks = await sdk.blocks.getBlocks(timestamp - 7 * 24 * 60 * 60, Object.keys(FactoryConfigs));

  for (const [chain, factoryConfig] of Object.entries(FactoryConfigs)) {
    const currentBlock = currentBlocks.chainBlocks[chain];
    const last1DaysBlock = last1DaysBlocks.chainBlocks[chain];
    const last7DaysBlock = last7DaysBlocks.chainBlocks[chain];

    const allTokens = {};
    const allDexPools = {};
    const rawPools = await fetchPools(chain, currentBlock);

    const tokenCalls = [];
    const balanceCalls = [];
    for (const rawPool of Object.values(rawPools)) {
      tokenCalls.push(rawPool.token0Address);
      tokenCalls.push(rawPool.token1Address);
      balanceCalls.push({ target: rawPool.token0Address, params: [rawPool.pool] });
      balanceCalls.push({ target: rawPool.token1Address, params: [rawPool.pool] });
    }
    const [symbols, decimals, balances] = await Promise.all([
      sdk.api2.abi.multiCall({ chain: chain, abi: 'string:symbol', calls: tokenCalls }),
      sdk.api2.abi.multiCall({ chain: chain, abi: 'uint8:decimals', calls: tokenCalls }),
      sdk.api2.abi.multiCall({ chain: chain, abi: 'function balanceOf(address) view returns (uint256)', calls: balanceCalls }),
    ]);

    for (let i = 0; i < Object.values(rawPools).length; i++) {
      const rawPool = Object.values(rawPools)[i];

      const token0 = { address: rawPool.token0Address, symbol: symbols[i * 2], decimals: Number(decimals[i * 2]) }
      const token1 = { address: rawPool.token1Address, symbol: symbols[i * 2 + 1], decimals: Number(decimals[i * 2 + 1]) }

      allDexPools[rawPool.pool] = {
        pool: rawPool.pool,
        fee0In: rawPool.fee0In,
        fee1In: rawPool.fee1In,
        token0: token0,
        token1: token1,
        reserve0: Number(balances[i * 2]),
        reserve1: Number(balances[i * 2 + 1]),

        // will fill below
        tvlUsd: 0,
        volumeUsd1d: 0,
        volumeUsd7d: 0,
        feeUsd1d: 0,
        feeUsd7d: 0,
      }

      allTokens[rawPool.token0Address] = token0;
      allTokens[rawPool.token1Address] = token1;
    }

    // get token price from llama coins api
    const coinLists = Object.keys(allTokens).map(token => `${chain}:${token}`);
    const coinPrices = (await superagent.get(`https://coins.llama.fi/prices/current/${coinLists.toString()}`)).body.coins;
    for (const [coinId, coinPrice] of Object.entries(coinPrices)) {
      allTokens[utils.formatAddress(coinId.split(':')[1])].price = Number(coinPrice.price);
    }

    // cal tvl
    for (const [address, dexPool] of Object.entries(allDexPools)) {
      const token0Price = allTokens[dexPool.token0.address].price ? allTokens[dexPool.token0.address].price : 0;
      const token1Price = allTokens[dexPool.token1.address].price ? allTokens[dexPool.token1.address].price : 0;
      const token0Reserve = dexPool.reserve0 * token0Price / 10**dexPool.token0.decimals;
      const token1Reserve = dexPool.reserve1 * token1Price / 10**dexPool.token1.decimals;

      // update pool tvl USD
      allDexPools[address].tvlUsd = token0Reserve + token1Reserve;
    }

    const iface = new ethers.utils.Interface([EventPoolSwap])
    const swapLogs = (await sdk.getEventLogs({
      chain: chain,
      eventAbi: EventPoolSwap,
      targets: Object.values(allDexPools).filter(pool => pool.tvlUsd > 0).map(pool => pool.pool),
      flatten: true, // !!!
      fromBlock: last7DaysBlock,
      toBlock: currentBlock,
      entireLog: true,
    })).map(log => {
      const event = iface.parseLog({
        topics: log.topics,
        data: log.data,
      });

      return {
        address: utils.formatAddress(log.address),
        blockNumber: Number(log.blockNumber),
        args: {
          swap0to1: event.args[2].tokenAIn,
          amountIn: Number(event.args.amountIn),
          amountOut: Number(event.args.amountOut),
        }
      }
    });

    for (const log of swapLogs) {
      let volumeUsd = 0;
      let feeUsd = 0;
      const dexPool = allDexPools[log.address];
      if (log.args.swap0to1) {
        const tokenPrice = allTokens[dexPool.token0.address].price ? allTokens[dexPool.token0.address].price : 0;
        volumeUsd = Number(log.args.amountIn) * tokenPrice / 10**dexPool.token0.decimals;
        feeUsd = volumeUsd * dexPool.fee0In;
      } else {
        const tokenPrice = allTokens[dexPool.token1.address].price ? allTokens[dexPool.token1.address].price : 0;
        volumeUsd = Number(log.args.amountIn) * tokenPrice / 10**dexPool.token1.decimals;
        feeUsd = volumeUsd * dexPool.fee1In;
      }

      if (log.blockNumber >= last1DaysBlock) {
        allDexPools[log.address].volumeUsd1d += volumeUsd;
        allDexPools[log.address].feeUsd1d += feeUsd;
      }
      allDexPools[log.address].volumeUsd7d += volumeUsd;
      allDexPools[log.address].feeUsd7d += feeUsd;
    }

    for (const p of Object.values(allDexPools).filter(pool => pool.tvlUsd > 0)) {
      yieldPools.push({
        chain: utils.formatChain(chain),
        project: PROJECT,
        pool: p.pool,
        symbol: utils.formatSymbol(`${p.token0.symbol}-${p.token1.symbol}`),
        underlyingTokens: [p.token0.address, p.token1.address],
        tvlUsd: p.tvlUsd,
        apyBase: p.feeUsd1d * 100 * 365 / p.tvlUsd,
        apyBase7d: p.feeUsd7d * 100 * 365 / 7 / p.tvlUsd,
        volumeUsd1d: p.volumeUsd1d,
        volumeUsd7d: p.volumeUsd7d,
        url: getPoolLink(chain, p.pool),
      })
    }
  }

  return yieldPools;
};

module.exports = {
  timetravel: true,
  apy: main,
};
