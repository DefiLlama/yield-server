const superagent = require('superagent');
const sdk = require('@defillama/sdk');
const utils = require('../utils');
const ethers = require('ethers');
const abis = require('./abi.json');

const PROJECT = 'fluid-dex';

const DexReservesResolvers = {
  ethereum: '0xC93876C0EEd99645DD53937b25433e311881A27C',
  arbitrum: '0x666A400b8cDA0Dc9b59D61706B0F982dDdAF2d98',
  polygon: '0x18DeDd1cF3Af3537D4e726D2Aa81004D65DA8581',
  base: '0x41E6055a282F8b7Abdb8D22Bcd85c2A0eE22e38A',
}

const EventSwap = 'event Swap(bool swap0to1, uint256 amountIn, uint256 amountOut, address to)';

function formatAddress(address) {
  return address.toLowerCase();
}

function getTokenInfo(chain, address, symbol, decimals) {
  if (address === '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE') {
    return {
      address: '0x0000000000000000000000000000000000000000',
      symbol: chain === 'polygon' ? 'POL' : 'ETH',
      decimals: 18,
    }
  } else {
    return {
      address: formatAddress(address),
      symbol: symbol,
      decimals: Number(decimals),
    }
  }
}

function getPoolLink(chain, poolIndex) {
  let chainId = 1
  if (chain === 'arbitrum') chainId = 42161;
  if (chain === 'polygon') chainId = 137;
  if (chain === 'base') chainId = 8453;

  return `https://fluid.io/stats/${chainId}/dex#${poolIndex}`;
}

const main = async (unixTimestamp) => {
  const yieldPools = []

  const timestamp = unixTimestamp ? unixTimestamp : Math.floor(new Date().getTime() / 1000);
  const currentBlocks = await sdk.blocks.getBlocks(timestamp, Object.keys(DexReservesResolvers))
  const last1DaysBlocks = await sdk.blocks.getBlocks(timestamp - 24 * 60 * 60, Object.keys(DexReservesResolvers))
  const last7DaysBlocks = await sdk.blocks.getBlocks(timestamp - 7 * 24 * 60 * 60, Object.keys(DexReservesResolvers))

  for (const [chain, dexResolver] of Object.entries(DexReservesResolvers)) {
    const currentBlock = currentBlocks.chainBlocks[chain];
    const last1DaysBlock = last1DaysBlocks.chainBlocks[chain];
    const last7DaysBlock = last7DaysBlocks.chainBlocks[chain];

    const rawPoolReserves = (await sdk.api2.abi.call({
      chain: chain,
      target: DexReservesResolvers[chain],
      abi: abis.find(item => item.name === 'getAllPoolsReserves'),
    }))

    const allTokens = {};
    const allDexPools = {};
    for (const pool of rawPoolReserves) {
      const [symbols, decimals] = await Promise.all([
        sdk.api2.abi.multiCall({
          chain: chain,
          abi: 'string:symbol',
          calls: [pool.token0, pool.token1],
          permitFailure: true,
        }),
        sdk.api2.abi.multiCall({
          chain: chain,
          abi: 'uint8:decimals',
          calls: [pool.token0, pool.token1],
          permitFailure: true,
        }),
      ]);

      const poolAddress = formatAddress(pool.pool);
      const token0 = getTokenInfo(chain, pool.token0, symbols[0], decimals[0]);
      const token1 = getTokenInfo(chain, pool.token1, symbols[1], decimals[1]);
      const feeRate = Number(pool.fee) / 1e6;

      allTokens[token0.address] = token0;
      allTokens[token1.address] = token1;
      allDexPools[poolAddress] = {
        pool: poolAddress,
        token0,
        token1,
        feeRate,
        reserve0: Number(pool.collateralReserves.token0RealReserves) + Number(pool.debtReserves.token0RealReserves),
        reserve1: Number(pool.collateralReserves.token1RealReserves) + Number(pool.debtReserves.token1RealReserves),

        // will fill below
        tvlUsd: 0,
        volumeUsd1d: 0,
        volumeUsd7d: 0,
      }
    }

    // get token price from llama coins api
    const coinLists = Object.keys(allTokens).map(token => `${chain}:${token}`);
    const coinPrices = (await superagent.get(`https://coins.llama.fi/prices/current/${coinLists.toString()}`)).body.coins;
    for (const [coinId, coinPrice] of Object.entries(coinPrices)) {
      allTokens[formatAddress(coinId.split(':')[1])].price = Number(coinPrice.price);
    }

    for (const [address, dexPool] of Object.entries(allDexPools)) {
      const token0Price = allTokens[dexPool.token0.address].price ? allTokens[dexPool.token0.address].price : 0;
      const token1Price = allTokens[dexPool.token1.address].price ? allTokens[dexPool.token1.address].price : 0;
      const token0Reserve = dexPool.reserve0 * token0Price / 10**dexPool.token0.decimals;
      const token1Reserve = dexPool.reserve1 * token1Price / 10**dexPool.token1.decimals;

      // update pool tvl USD
      allDexPools[address].tvlUsd = token0Reserve + token1Reserve;
    }

    const iface = new ethers.utils.Interface([EventSwap])
    const swapLogs = (await sdk.getEventLogs({
      chain: chain,
      eventAbi: EventSwap,
      targets: Object.keys(allDexPools),
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
        address: formatAddress(log.address),
        blockNumber: Number(log.blockNumber),
        args: {
          swap0to1: event.args.swap0to1,
          amountIn: Number(event.args.amountIn),
          amountOut: Number(event.args.amountOut),
        }
      }
    });

    for (const log of swapLogs) {
      let volumeUsd = 0;
      const dexPool = allDexPools[log.address];
      if (log.args.swap0to1) {
        const tokenPrice = allTokens[dexPool.token0.address].price ? allTokens[dexPool.token0.address].price : 0;
        volumeUsd = Number(log.args.amountIn) * tokenPrice / 10**dexPool.token0.decimals;
      } else {
        const tokenPrice = allTokens[dexPool.token1.address].price ? allTokens[dexPool.token1.address].price : 0;
        volumeUsd = Number(log.args.amountIn) * tokenPrice / 10**dexPool.token1.decimals;
      }

      if (log.blockNumber >= last1DaysBlock) {
        allDexPools[log.address].volumeUsd1d += volumeUsd;
      }
      allDexPools[log.address].volumeUsd7d += volumeUsd;
    }

    for (const p of Object.values(allDexPools).filter(pool => pool.tvlUsd > 0)) {
      const feeUsd = p.volumeUsd1d * p.feeRate;
      const feeUsd7d = p.volumeUsd7d * p.feeRate;

      yieldPools.push({
        chain: utils.formatChain(chain),
        project: PROJECT,
        pool: `${chain}-${p.pool}`, // there are same pools addresses
        symbol: utils.formatSymbol(`${p.token0.symbol}-${p.token1.symbol}`),
        underlyingTokens: [p.token0.address, p.token1.address],
        tvlUsd: p.tvlUsd,
        apyBase: feeUsd * 100 * 365 / p.tvlUsd,
        apyBase7d: feeUsd7d * 100 * 365 / 7 / p.tvlUsd,
        volumeUsd1d: p.volumeUsd1d,
        volumeUsd7d: p.volumeUsd7d,
        url: getPoolLink(chain, Object.keys(allDexPools).indexOf(p.pool) + 1),
      })
    }
  }

  return yieldPools;
};

module.exports = {
  timetravel: true,
  apy: main,
};
