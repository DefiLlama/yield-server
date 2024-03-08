const sdk = require('@defillama/sdk');
const { gql, request } = require('graphql-request');
const { BigNumber, utils: etherUtils } = require('ethers');
const utils = require('../utils');
const PoolViewerABI = require('./abi.json');
const IGammaPoolABI = require('./IGammaPool.json');

function supplyApy(snapshot, poolInfo) {
  const avgDecimals = (Number(poolInfo.decimals[0]) + Number(poolInfo.decimals[1])) / 2;
  const totalLiquidityBefore = Number(etherUtils.formatUnits(snapshot.totalLiquidity, avgDecimals));
  const totalLiquidityAfter = Number(etherUtils.formatUnits(BigNumber.from(poolInfo.BORROWED_INVARIANT).add(BigNumber.from(poolInfo.LP_INVARIANT)), avgDecimals));
  const liquidityGrowth = totalLiquidityAfter / totalLiquidityBefore;
  const totalSupplyBefore = Number(etherUtils.formatUnits(snapshot.totalSupply, 18));
  const totalSupplyAfter = Number(etherUtils.formatUnits(poolInfo.totalSupply, 18));
  const supplyGrowth = totalSupplyAfter / totalSupplyBefore;
  const supplyYield = liquidityGrowth / supplyGrowth - 1.0;
  const timeDiff = (new Date()).getTime() / 1000 - Number(snapshot.timestamp);
  const secondsOfDay = 24 * 60 * 60;
  return supplyYield * (secondsOfDay / timeDiff) * 365 * 100;
}

function borrowApy(snapshot, poolInfo) {
  const accFeeIndex1DayAgoNum = Number(etherUtils.formatUnits(snapshot.accFeeIndex, 18));
  const accFeeIndexNum = Number(etherUtils.formatUnits(poolInfo.accFeeIndex, 18));
  const borrowYield = ((accFeeIndexNum / accFeeIndex1DayAgoNum) - 1.0);
  const timeDiff = (new Date()).getTime() / 1000 - Number(snapshot.timestamp);
  const secondsOfDay = 24 * 60 * 60;
  return borrowYield * (secondsOfDay / timeDiff) * 365 * 100;
}

function formatSymbols(symbols, addresses) {
  if(addresses[0] == "0xFF970A61A04b1cA14834A43f5dE4533eBDDB5CC8") {
    symbols[0] = "USDC.e";
  }
  if(addresses[1] == "0xFF970A61A04b1cA14834A43f5dE4533eBDDB5CC8") {
    symbols[1] = "USDC.e";
  }
  return symbols.join("-");
}

async function apy() {
  const poolAddr = '0x63c531ffed7e17f8adca4ed490837838f6fa1b66';
  const { output: poolViewer }  = await sdk.api.abi.call( {
    target: poolAddr,
    abi: IGammaPoolABI[0],
    chain: 'arbitrum'
  });

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
          accFeeIndex
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
    symbol: formatSymbols(latestPoolsData[i].output.symbols,latestPoolsData[i].output.tokens),
    tvlUsd: Number(gammaPoolTracers[i].lastDailyData.pool.tvlUSD),
    apyBase: supplyApy(gammaPoolTracers[i].lastDailyData, latestPoolsData[i].output),
    apyBaseBorrow: borrowApy(gammaPoolTracers[i].lastDailyData, latestPoolsData[i].output),
    underlyingTokens: latestPoolsData[i].output.tokens,
    url: `https://app.gammaswap.com/earn/${pool}`,
  }));
}

module.exports = {
  timetravel: false,
  apy
}