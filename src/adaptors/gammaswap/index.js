const sdk = require('@defillama/sdk5');
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

function formatSymbols(chainName, symbols, addresses) {
  if(chainName == "arbitrum") {
    if(addresses[0] == "0xFF970A61A04b1cA14834A43f5dE4533eBDDB5CC8") {
      symbols[0] = "USDC.e";
    }
    if(addresses[1] == "0xFF970A61A04b1cA14834A43f5dE4533eBDDB5CC8") {
      symbols[1] = "USDC.e";
    }
  }
  return symbols.join("-");
}

async function apy() {
  const chainInfo = [
    {
      chainName: "arbitrum",
      endpoint: "https://api.thegraph.com/subgraphs/name/gammaswap/gammaswap-v1-arbitrum",
      refPoolAddr: "0x63c531ffed7e17f8adca4ed490837838f6fa1b66",
    },
    {
      chainName: "base",
      endpoint: "https://api.studio.thegraph.com/query/49518/gammaswap-v1-base/version/latest",
      refPoolAddr: "0xcd4257699b48d4791e77116d0e6a3bd48ad9567f",
    }
  ]

  let pools = [];
  for(let i = 0; i < chainInfo.length; i++) {
    const _pools = await apyPerChain(chainInfo[i].chainName, chainInfo[i].refPoolAddr, chainInfo[i].endpoint)
    pools = pools.concat(_pools);
  }
  return pools;
}

async function apyPerChain(chainName, refPoolAddr, endpoint) {
  const { output: poolViewer }  = await sdk.api.abi.call( {
    target: refPoolAddr,
    abi: IGammaPoolABI[0],
    chain: chainName
  });

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
    chain: chainName,
    permitFailure: true,
  });

  let _latestPoolsData = latestPoolsData.filter(function(pool) {
    return (Number(pool.output.decimals[0]) + Number(pool.output.decimals[1])) % 2 == 0;
  });

  const _pools = pools.filter(function(pool, i) {
    return (Number(latestPoolsData[i].output.decimals[0]) + Number(latestPoolsData[i].output.decimals[1])) % 2 == 0;
  });

  const _gammaPoolTracers = gammaPoolTracers.filter(function(tracer, i) {
    return (Number(latestPoolsData[i].output.decimals[0]) + Number(latestPoolsData[i].output.decimals[1])) % 2 == 0;
  });

  return _pools.map((pool, i) => ({
    pool,
    chain: utils.formatChain(chainName),
    project: "gammaswap",
    symbol: formatSymbols(chainName, _latestPoolsData[i].output.symbols,_latestPoolsData[i].output.tokens),
    tvlUsd: Number(_gammaPoolTracers[i].lastDailyData.pool.tvlUSD),
    apyBase: supplyApy(_gammaPoolTracers[i].lastDailyData, _latestPoolsData[i].output),
    apyBaseBorrow: borrowApy(_gammaPoolTracers[i].lastDailyData, _latestPoolsData[i].output),
    underlyingTokens: _latestPoolsData[i].output.tokens,
    url: `https://app.gammaswap.com/earn/${pool}`,
  }));
}

module.exports = {
  timetravel: false,
  apy
}