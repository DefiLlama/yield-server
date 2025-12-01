const utils = require('../utils');
const axios = require('axios');
const ethers = require('ethers');
const sdk = require('@defillama/sdk');

const chains = {
  1: {
    chainName: 'ethereum',
    chainSlug: 'ethereum',
    PENDLE: '0x808507121b80c02388fad14726482e061b8da827',
    ROUTERS: ['0x888888888889758F76e7103c6CbF23ABbF58F946'],
  },
  42161: {
    chainName: 'arbitrum',
    chainSlug: 'arbitrum',
    PENDLE: '0x0c880f6761f1af8d9aa9c466984b80dab9a8c9e8',
    ROUTERS: ['0x888888888889758F76e7103c6CbF23ABbF58F946'],
  },
  56: {
    chainName: 'bsc',
    chainSlug: 'bnbchain',
    PENDLE: '0xb3ed0a426155b79b898849803e3b36552f7ed507',
    ROUTERS: ['0x888888888889758F76e7103c6CbF23ABbF58F946'],
    disabledVolume: true,
  },
  10: {
    chainName: 'optimism',
    chainSlug: 'optimism',
    PENDLE: '0xBC7B1Ff1c6989f006a1185318eD4E7b5796e66E1',
    ROUTERS: ['0x888888888889758F76e7103c6CbF23ABbF58F946'],
  },
  146: {
    chainName: 'sonic',
    chainSlug: 'sonic',
    PENDLE: '0xf1ef7d2d4c0c881cd634481e0586ed5d2871a74b',
    ROUTERS: ['0x888888888889758F76e7103c6CbF23ABbF58F946'],
  },
  8453: {
    chainName: 'base',
    chainSlug: 'base',
    PENDLE: '0xa99f6e6785da0f5d6fb42495fe424bce029eeb3e',
    ROUTERS: ['0x888888888889758F76e7103c6CbF23ABbF58F946'],
  },
  5000: {
    chainName: 'mantle',
    chainSlug: 'mantle',
    PENDLE: '0xd27b18915e7acc8fd6ac75db6766a80f8d2f5729',
    ROUTERS: ['0x888888888889758F76e7103c6CbF23ABbF58F946'],
  },
  999: {
    chainName: 'hyperliquid',
    chainSlug: 'hyperliquid',
    PENDLE: '0xD6Eb81136884713E843936843E286FD2a85A205A',
    ROUTERS: ['0x888888888889758F76e7103c6CbF23ABbF58F946'],
    disabledVolume: true,
  },
  80094: {
    chainName: 'berachain',
    chainSlug: 'berachain',
    PENDLE: '0xFf9c599D51C407A45D631c6e89cB047Efb88AeF6',
    ROUTERS: ['0x888888888889758F76e7103c6CbF23ABbF58F946'],
  },
};

function splitId(id) {
  const [chainId, address] = id.split('-');
  return { chainId, address };
}

function expiryToText(dateIso) {
  return new Date(dateIso)
    .toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    })
    .replace(/ /g, '')
    .toUpperCase();
}

const ROUTER_EVENTS = {
  // on these events, router will do a swap (zap in or zap out)
  // so, swap volume = add/remove volume / 2
  AddLiquiditySingleToken: 'event AddLiquiditySingleToken(address indexed caller, address indexed market, address indexed token, address receiver, uint256 netTokenAmount, uint256 netLpOut, uint256 netSyInterm)',
  RemoveLiquiditySingleToken: 'event RemoveLiquiditySingleToken(address indexed caller, address indexed market, address indexed token, address receiver, uint256 netLpToRemove, uint256 netTokenAmount, uint256 netSyInterm)',

  // swap volumes
  SwapPtAndToken: 'event SwapPtAndToken(address indexed caller, address indexed market, address indexed token, address receiver, int256 netPtToAccount, int256 netTokenAmount, uint256 netSyInterm)',
  SwapYtAndToken: 'event SwapYtAndToken(address indexed caller, address indexed market, address indexed token, address receiver, int256 netYtToAccount, int256 netTokenAmount, uint256 netSyInterm)',
}

async function fetchPoolsVolumes(chain, pools, routers) {
  const timestamp = Math.floor(new Date().getTime() / 1000);
  const currentBlocks = await sdk.blocks.getBlocks(timestamp, [chain])
  const last1DaysBlocks = await sdk.blocks.getBlocks(timestamp - 24 * 60 * 60, [chain])
  const last7DaysBlocks = await sdk.blocks.getBlocks(timestamp - 7 * 24 * 60 * 60, [chain])

  const currentBlock = currentBlocks.chainBlocks[chain];
  const last1DaysBlock = last1DaysBlocks.chainBlocks[chain];
  const last7DaysBlock = last7DaysBlocks.chainBlocks[chain];
  
  const markets = {}
  for (const pool of pools) {
    const marketAddress = utils.formatAddress(pool.address)
    const tokenAddress = utils.formatAddress(pool.underlyingAsset.split('-')[1])
    markets[utils.formatAddress(pool.address)] = {
      market: marketAddress,
      token: tokenAddress,

      // will fill at step get swap volumes
      volumeUsd1d: 0,
      volumeUsd7d: 0,
    }
  }
  
  const addLogs = await sdk.getEventLogs({
    chain: chain,
    targets: routers,
    eventAbi: ROUTER_EVENTS.AddLiquiditySingleToken,
    flatten: true, // !!!
    fromBlock: last7DaysBlock,
    toBlock: currentBlock,
    entireLog: true,
  });
  const removeLogs = await sdk.getEventLogs({
    chain: chain,
    targets: routers,
    eventAbi: ROUTER_EVENTS.AddLiquiditySingleToken,
    flatten: true, // !!!
    fromBlock: last7DaysBlock,
    toBlock: currentBlock,
    entireLog: true,
  });
  const SwapPtAndTokenLogs = await sdk.getEventLogs({
    chain: chain,
    targets: routers,
    eventAbi: ROUTER_EVENTS.AddLiquiditySingleToken,
    flatten: true, // !!!
    fromBlock: last7DaysBlock,
    toBlock: currentBlock,
    entireLog: true,
  });
  const SwapYtAndTokenLogs = await sdk.getEventLogs({
    chain: chain,
    targets: routers,
    eventAbi: ROUTER_EVENTS.AddLiquiditySingleToken,
    flatten: true, // !!!
    fromBlock: last7DaysBlock,
    toBlock: currentBlock,
    entireLog: true,
  });

  const iface = new ethers.utils.Interface(Object.values(ROUTER_EVENTS))
  const events = addLogs.concat(removeLogs).map(log => {
    const event = iface.parseLog({
      topics: log.topics,
      data: log.data,
    });

    const market = utils.formatAddress(event.args.market);
    if (!markets[market]) return null;

    let netTokenAmount = Number(event.args.netTokenAmount);
    if (event.name === 'AddLiquiditySingleToken' || event.name === 'RemoveLiquiditySingleToken') {
      netTokenAmount = netTokenAmount / 2;
    }

    return {
      tx: log.transactionHash, // for debug purpose
      address: utils.formatAddress(log.address),
      blockNumber: Number(log.blockNumber),
      market,
      token: utils.formatAddress(event.args.token),
      tokenAmount: netTokenAmount,
    }
  }).filter(Boolean)

  const tokens = {}
  for (const event of events) {
    tokens[event.token] = {
      price: 0,
      decimals: 0,
    }
  }

  // fill token decimals
  const decimals = await sdk.api2.abi.multiCall({
    chain: chain,
    abi: 'uint8:decimals',
    calls: Object.keys(tokens),
    permitFailure: true,
  });
  for (let i = 0; i < Object.keys(tokens).length; i++) {
    tokens[Object.keys(tokens)[i]].decimals = decimals[i] ? Number(decimals[i]) : 18;
  }

  // get token price from llama coins api
  const coinLists = Object.keys(tokens).map(token => `${chain}:${token}`);
  const coinPrices = (await axios.get(`https://coins.llama.fi/prices/current/${coinLists.toString()}`)).data.coins;
  for (const [coinId, coinPrice] of Object.entries(coinPrices)) {
    tokens[utils.formatAddress(coinId.split(':')[1])].price = Number(coinPrice.price);
  }

  for (const event of events) {
    if (!tokens[event.token]) {
      console.warn(`Token not found for event.token: ${event.token}`);
      continue;
    }
    if (!markets[event.market]) {
      console.warn(`Market not found for event.market: ${event.market}`);
      continue;
    }
    const volumeUsd = event.tokenAmount * tokens[event.token].price / 10**tokens[event.token].decimals;

    if (event.blockNumber >= last1DaysBlock) {
      markets[event.market].volumeUsd1d += volumeUsd;
    }
    markets[event.market].volumeUsd7d += volumeUsd;
  }

  return pools.map(pool => {
    const market = markets[utils.formatAddress(pool.address)] || { volumeUsd1d: 0, volumeUsd7d: 0 };
    return {
      ...pool,
      volumeUsd1d: market.volumeUsd1d,
      volumeUsd7d: market.volumeUsd7d,
    }
  })
}

async function poolApys(chainId, pools) {
  // support swap volumes on pool
  const poolWithVolumes = chains[chainId].disabledVolume ? pools : await fetchPoolsVolumes(chains[chainId].chainName, pools, chains[chainId].ROUTERS)

  return poolWithVolumes.map((p) => ({
    pool: p.address,
    chain: utils.formatChain(chains[chainId].chainName),
    project: 'pendle',
    symbol: utils.formatSymbol(p.name),
    tvlUsd: p.details.liquidity,
    apyBase: (p.details.aggregatedApy - p.details.pendleApy) * 100,
    apyReward: p.details.pendleApy * 100,
    rewardTokens: [chains[chainId].PENDLE],
    underlyingTokens: [splitId(p.pt).address, splitId(p.sy).address],
    volumeUsd1d: typeof p.volumeUsd1d === 'number' ? p.volumeUsd1d : 0,
    volumeUsd7d: typeof p.volumeUsd7d === 'number' ? p.volumeUsd7d : 0,
    poolMeta: `For LP | Maturity ${expiryToText(p.expiry)}`,
    url: `https://app.pendle.finance/trade/pools/${p.address}/zap/in?chain=${chains[chainId].chainSlug}`,
  }));
}

function ptApys(chainId, pools) {
  return pools.map((p) => ({
    pool: splitId(p.pt).address,
    chain: utils.formatChain(chains[chainId].chainName),
    project: 'pendle',
    symbol: utils.formatSymbol(p.name),
    tvlUsd: p.details.liquidity,
    apyBase: p.details.impliedApy * 100,
    underlyingTokens: [splitId(p.underlyingAsset).address],
    poolMeta: `For buying PT-${p.name}-${expiryToText(p.expiry)}`,
    url: `https://app.pendle.finance/trade/markets/${p.address}/swap?view=pt&chain=${chains[chainId].chainSlug}&py=output`,
  }));
}

async function apy() {
  const date = new Date();
  const poolsFiltered = [];

  await Promise.all(
    Object.keys(chains).map(async (chainId) => {
      const pools = (
        await axios.get(
          `https://api-v2.pendle.finance/core/v1/${chainId}/markets/active`
        )
      ).data.markets;
      const poolApysList = await poolApys(chainId, pools)
      const ptApysList = ptApys(chainId, pools)

      const yieldPools = [poolApysList, ptApysList]
        .flat()
        .sort((a, b) => b.tvlUsd - a.tvlUsd);

      const unique = new Set();
      for (const p of yieldPools) {
        if (unique.has(p.pool)) continue;
        poolsFiltered.push(p);
        unique.add(p.pool);
      }
    })
  );

  return poolsFiltered;
}

module.exports = {
  timetravel: false,
  apy,
};
