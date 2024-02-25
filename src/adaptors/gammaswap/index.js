const sdk = require('@defillama/sdk');
const { gql, request } = require('graphql-request');
const { BigNumber, utils: etherUtils } = require('ethers');
const utils = require('../utils');
const PoolViewerABI = require('./abi.json');

function supplyApy(snapshot, poolInfo) {
  const totalLiquidityBefore = Number(etherUtils.formatUnits(snapshot.totalLiquidity), 18);
  const totalLiquidityAfter = Number(etherUtils.formatUnits(BigNumber.from(poolInfo.BORROWED_INVARIANT).add(BigNumber.from(poolInfo.LP_INVARIANT))), 18);
  const liquidityGrowth = totalLiquidityAfter / totalLiquidityBefore;
  const totalSupplyBefore = Number(etherUtils.formatUnits(snapshot.totalSupply), 18);
  const totalSupplyAfter = Number(etherUtils.formatUnits(poolInfo.totalSupply), 18);
  const supplyGrowth = totalSupplyAfter / totalSupplyBefore;
  const supplyYield = liquidityGrowth / supplyGrowth - 1.0;
  const timeDiff = (new Date()).getTime() / 1000 - Number(snapshot.timestamp);
  const secondsOfDay = 24 * 60 * 60;

  return supplyYield * (secondsOfDay / timeDiff) * 100;
}

async function apy() {
  const poolViewer = '0xcf2b6bc8c0e0a1292db7f0ae89410670796350c8';
  const endpoint = 'https://api.thegraph.com/subgraphs/name/gammaswap/gammaswap-v1-arbitrum';
  const query = gql`
    {
      gammaPoolTracers {
        lastDailyData {
          pool {
            id
            tvlUSD
          }
          totalLiquidity
          totalSupply
          timestamp
        }
      }
    }
  `;
  const { gammaPoolTracers } = await request(endpoint, query)

  const pools = gammaPoolTracers.map((tracer) => tracer.lastDailyData.pool.id);

  const { output: latestPoolsData } = await sdk.api.abi.multiCall({
    abi: PoolViewerABI[0],
    calls: pools.map(pool => ({
      target: poolViewer,
      params: pool
    })),
    chain: 'arbitrum',
    permitFailure: true,
  });

  return pools.map((pool, i) => ({
    pool,
    chain: utils.formatChain('arbitrum'),
    project: 'gammaswap',
    symbol: latestPoolsData[i].output.symbols.join('-'),
    tvlUsd: Number(gammaPoolTracers[i].lastDailyData.pool.tvlUSD),
    apyBase: supplyApy(gammaPoolTracers[i].lastDailyData, latestPoolsData[i].output),
    underlyingTokens: latestPoolsData[i].output.tokens,
  }));
}

module.exports = {
  timetravel: false,
  apy
}