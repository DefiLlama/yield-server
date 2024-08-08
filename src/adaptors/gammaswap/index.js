const sdk = require('@defillama/sdk');
const { gql, request } = require('graphql-request');
const { BigNumber, utils: etherUtils } = require('ethers');
const utils = require('../utils');
const PoolViewerABI = require('./abi.json');
const IGammaPoolABI = require('./IGammaPool.json');
const IStakingRouterABI = require('./IStakingRouter.json');
const IRewardTrackerABI = require('./IRewardTracker.json');
const IRewardDistributorABI = require('./IRewardDistributor.json');

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
      endpoint: "https://api.goldsky.com/api/public/project_clut9lukx80ry01xb5ngf1zmj/subgraphs/gammaswap-v1-arbitrum/prod/gn",
      refPoolAddr: "0x63c531ffed7e17f8adca4ed490837838f6fa1b66",
    },
    {
      chainName: "base",
      endpoint: "https://api.goldsky.com/api/public/project_clut9lukx80ry01xb5ngf1zmj/subgraphs/gammaswap-v1-base/prod/gn",
      refPoolAddr: "0xcd4257699b48d4791e77116d0e6a3bd48ad9567f",
    },
    {
      chainName: "ethereum",
      endpoint: "https://api.goldsky.com/api/public/project_clut9lukx80ry01xb5ngf1zmj/subgraphs/gammaswap-v1-mainnet/prod/gn",
      refPoolAddr: "0xc70150188142fbfcbb90db05bffc31bccded3da5",
    }
  ]

  let pools = [];
  for(let i = 0; i < chainInfo.length; i++) {
    const _pools = await apyPerChain(chainInfo[i].chainName, chainInfo[i].refPoolAddr, chainInfo[i].endpoint)
    pools = pools.concat(_pools);
  }
  return pools;
}

function formatChainName(chainName) {
  if(chainName == "ethereum") {
    return "mainnet";
  }
  return chainName;
}

function getRewardApy(chainName, poolId, stakingPoolData) {
  if(chainName == "arbitrum") {
    if(stakingPoolData && stakingPoolData[poolId]) {
      return stakingPoolData[poolId].apy;
    }
  }
  return 0;
}

function getRewardTokens(chainName, poolId, stakingPoolData) {
  if(chainName == "arbitrum") {
    if(stakingPoolData && stakingPoolData[poolId]) {
      return ["0xA159463aB4B3aF3865bC9DC0FD28d943f2C048Ce"];
    }
  }
  return [];
}

function getStakingInfo(chainName) {
  if(chainName == "arbitrum") {
    return {
      stakingRouter: "0x9b91328f04ed1183548bD6bDad24Da40311E077C",
      escrowToken: "0xa159463ab4b3af3865bc9dc0fd28d943f2c048ce",
      rewardToken: "0x912ce59144191c1204e64559fe8253a0e49e6548"
    }
  }
  return {};
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
            activeStaking
            token0 {
              id
              symbol
              priceUSD
            }
            token1 {
              id
              symbol
              priceUSD
            }
          }
          totalLiquidity
          totalSupply
          accFeeIndex
          timestamp
        }
      }
    }
  `;
  const { gammaPoolTracers: gammaPoolTracersList } = await request(endpoint, query)
  const gammaPoolTracers = gammaPoolTracersList.filter((tracer) => tracer.lastDailyData != null )

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

  const stakingPools = _gammaPoolTracers.filter((tracer) => tracer.lastDailyData.pool.activeStaking )
  const stakingPoolIds = stakingPools.map((tracer) => tracer.lastDailyData.pool.id);

  const stakingInfo = getStakingInfo(chainName);
  const stakingRouter = stakingInfo.stakingRouter;
  const esToken = stakingInfo.escrowToken;

  const stakingPoolData = {}; // identify by pool
  if(false && etherUtils.isAddress(stakingRouter) && etherUtils.isAddress(esToken) && stakingPoolIds.length > 0) {
    const latestPoolDataMap = {}
    for(let i = 0; i < latestPoolsData.length; i++) {
      latestPoolDataMap[latestPoolsData[i].input.params[0]] = latestPoolsData[i].output
    }

    const stakingPoolsMap = {};
    for(let i = 0; i < stakingPools.length; i++) {
      const poolId = stakingPools[i].lastDailyData.pool.id;
      stakingPoolsMap[poolId] = stakingPools[i].lastDailyData.pool;
    }

    const queryRewardTokenPriceUSD = gql`{
      token(id:"${stakingInfo.rewardToken}") {
        priceUSD
        decimals
      }
    }`;
    const { token: rewardToken } = await request(endpoint, queryRewardTokenPriceUSD);

    const { output: trackers } = await sdk.api.abi.multiCall({
      abi: IStakingRouterABI[0],
      calls: stakingPoolIds.map(pool => ({
        target: stakingRouter,
        params: [pool, esToken]
      })),
      chain: chainName,
      permitFailure: true,
    });
    const distributorToPoolMap = {}
    for(let i = 0; i < trackers.length; i++) {
      distributorToPoolMap[trackers[i].output.rewardDistributor] = trackers[i].input.params[0]
    }

    const { output: totalDepositSupply } = await sdk.api.abi.multiCall({
      abi: IRewardTrackerABI[0],
      calls: trackers.map(item => ({
        target: item.output.rewardTracker,
        params: item.input.params[0]
      })),
      chain: chainName,
      permitFailure: true,
    });

    for(let i = 0; i < totalDepositSupply.length; i++) {
      // params0 is the pool
      stakingPoolData[totalDepositSupply[i].input.params[0]] = {
        rewardTracker:  totalDepositSupply[i].target,
        totalStaked: BigNumber.from(totalDepositSupply[i].output.toString()),
        apy: 0
      }
    }

    const { output: tokensPerInterval } = await sdk.api.abi.multiCall({
      abi: IRewardDistributorABI[0],
      calls: trackers.map(item => ({
        target: item.output.rewardDistributor
      })),
      chain: chainName,
      permitFailure: true,
    });
    const secondsPerYear = 365*24*60*60
    for(let i = 0; i < tokensPerInterval.length; i++) {
      const poolId = distributorToPoolMap[tokensPerInterval[i].input.target];
      const annualizedEmissions = etherUtils.formatUnits(BigNumber.from(tokensPerInterval[i].output.toString()).mul(secondsPerYear), rewardToken.decimals);
      const annualizedEmissionsUSD = Number(annualizedEmissions) * Number(rewardToken.priceUSD);

      const poolInfo = latestPoolDataMap[poolId];
      const poolSubgraphInfo = stakingPoolsMap[poolId];

      const token1PriceUSD = Number(poolSubgraphInfo.token1.priceUSD);
      const avgDecimals = (Number(poolInfo.decimals[0]) + Number(poolInfo.decimals[1])) / 2;
      const priceToken1 = Number(etherUtils.formatUnits(poolInfo.lastPrice, poolInfo.decimals[1]));
      const totalStaked = Number(etherUtils.formatUnits(stakingPoolData[poolId].totalStaked, 18));
      const totalInvariant = Number(etherUtils.formatUnits(BigNumber.from(poolInfo.BORROWED_INVARIANT).add(BigNumber.from(poolInfo.LP_INVARIANT)), avgDecimals));
      const totalGSLPSupply = Number(etherUtils.formatUnits(poolInfo.totalSupply, 18));
      const totalStakedUSD = (totalStaked * totalInvariant / totalGSLPSupply) * Math.sqrt(priceToken1) * token1PriceUSD;
      stakingPoolData[poolId].apy = annualizedEmissionsUSD * 100 / totalStakedUSD;
    }
  }

  return _pools.map((pool, i) => ({
    pool,
    chain: utils.formatChain(chainName),
    project: "gammaswap",
    symbol: formatSymbols(chainName, _latestPoolsData[i].output.symbols,_latestPoolsData[i].output.tokens),
    tvlUsd: Number(_gammaPoolTracers[i].lastDailyData.pool.tvlUSD),
    apyBase: supplyApy(_gammaPoolTracers[i].lastDailyData, _latestPoolsData[i].output),
    apyBaseBorrow: borrowApy(_gammaPoolTracers[i].lastDailyData, _latestPoolsData[i].output),
    //rewardTokens: getRewardTokens(chainName, pool, stakingPoolData),
    //apyReward: getRewardApy(chainName, pool, stakingPoolData), // APY from pool LM rewards in %
    underlyingTokens: _latestPoolsData[i].output.tokens,
    url: `https://app.gammaswap.com/earn/${formatChainName(chainName)}/${pool}`,
  }));
}

module.exports = {
  timetravel: false,
  apy
}