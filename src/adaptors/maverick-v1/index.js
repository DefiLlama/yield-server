const sdk = require('@defillama/sdk');
const utils = require('../utils');
const { request, gql } = require('graphql-request');

const PROJECT = 'maverick-v1';

const SubgraphConfigs = {
  ethereum: sdk.graph.modifyEndpoint('H4KMc3uRaRqKrM8dq8GKCt9gwmMQsRRiQRThZCM16KtB'),
}

const query = function(blockNumber) {
  return gql`
    {
      pools(first: 1000, orderBy: balanceUSD, orderDirection: desc, block: {number: ${blockNumber}}) {
        id
        tokenA {
          id
          symbol
        }
        tokenB {
          id
          symbol
        }
        volumeUSD
        balanceUSD
        fee
      }
    }
  `;
}

async function fetchPools(subgraph, blockNumber) {
  const poolsMap = {}

  const poolsList = (await request(subgraph, query(blockNumber))).pools;
  for (const pool of poolsList) {
    const poolAddress = String(pool.id).toLowerCase();
    const token0Address = String(pool.tokenA.id).toLowerCase();
    const token1Address = String(pool.tokenB.id).toLowerCase();
    poolsMap[poolAddress] = {
      address: poolAddress,
      token0: {
        address: token0Address,
        symbol: pool.tokenA.symbol,
      },
      token1: {
        address: token1Address,
        symbol: pool.tokenB.symbol,
      },
      volumeUSD: Number(pool.volumeUSD),
      balanceUSD: Number(pool.balanceUSD),
      feeRate: Number(pool.fee),
    }
  }

  return poolsMap
}

function getPoolLink(chain, poolAddress) {
  let chainId = 1
  if (chain === 'arbitrum') chainId = 42161;
  if (chain === 'polygon') chainId = 137;
  if (chain === 'base') chainId = 42161;

  return `https://app-v1.mav.xyz/pool/${poolAddress}?chain=${chainId}`;
}

const main = async (unixTimestamp) => {
  const yieldPools = []

  const timestamp = unixTimestamp ? unixTimestamp : Math.floor(new Date().getTime() / 1000);
  const currentBlocks = await sdk.blocks.getBlocks(timestamp, Object.keys(SubgraphConfigs));
  const last1DaysBlocks = await sdk.blocks.getBlocks(timestamp - 24 * 60 * 60, Object.keys(SubgraphConfigs));
  const last7DaysBlocks = await sdk.blocks.getBlocks(timestamp - 7 * 24 * 60 * 60, Object.keys(SubgraphConfigs));

  for (const [chain, subgraph] of Object.entries(SubgraphConfigs)) {
    const currentPoolsData = await fetchPools(subgraph, currentBlocks.chainBlocks[chain]);
    const last1DaysPoolsData = await fetchPools(subgraph, last1DaysBlocks.chainBlocks[chain]);
    const last7DaysPoolsData = await fetchPools(subgraph, last7DaysBlocks.chainBlocks[chain]);

    for (const [address, pool] of Object.entries(currentPoolsData)) {
      let volumeUsd1d = 0;
      let volumeUsd7d = 0;
      let feeUsd1d = 0;
      let feeUsd7d = 0;

      if (last1DaysPoolsData[address]) {
        volumeUsd1d = currentPoolsData[address].volumeUSD - last1DaysPoolsData[address].volumeUSD;
        feeUsd1d = volumeUsd1d * currentPoolsData[address].feeRate;
      }
      if (last7DaysPoolsData[address]) {
        volumeUsd7d = currentPoolsData[address].volumeUSD - last7DaysPoolsData[address].volumeUSD;
        feeUsd7d = volumeUsd7d * currentPoolsData[address].feeRate;
      }

      yieldPools.push({
        chain: utils.formatChain(chain),
        project: PROJECT,
        pool: address,
        symbol: utils.formatSymbol(`${pool.token0.symbol}-${pool.token1.symbol}`),
        underlyingTokens: [pool.token0.address, pool.token1.address],
        tvlUsd: pool.balanceUSD,
        apyBase: pool.balanceUSD > 0 ? feeUsd1d * 365 * 100 / pool.balanceUSD : 0,
        apyBase7d: pool.balanceUSD > 0 ? feeUsd7d * 365 * 100 / 7 / pool.balanceUSD : 0,
        volumeUsd1d: volumeUsd1d,
        volumeUsd7d: volumeUsd7d,
        url: getPoolLink(chain, address),
      })
    }
  }

  return yieldPools
    .filter(pool => pool.tvlUsd > 0);
};

module.exports = {
  timetravel: true,
  apy: main,
};
