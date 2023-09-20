import { getSnapshotsFromSubgraph, filterSnapshotData, Period, getAverageReturnPerSecondFromSnapshots, YEAR_IN_SECONDS } from "./returnHelper";

// const { gql, request } = require('graphql-request');
import {request} from 'graphql-request'
import {api} from '@defillama/sdk'
// const sdk = require('@defillama/sdk');
// const utils = require('../utils');
// import {superagent} from 'superagent'
// const superagent = require('superagent');
// const { HttpRequest } = require('aws-sdk');
import axios from 'axios';
const abi = require('./abi.json')
import { Chain } from "@defillama/sdk/build/general";

// add chain deployments and subgraph endpoints here
const supportedChains = [
    {   
        name: 'Polygon', 
        subgraphEndpoint: 'https://api.thegraph.com/subgraphs/name/steerprotocol/steer-protocol-polygon',
        chainId: 137,
        merkl: true,
        identifier: 'polygon'
    },
    {
        name: 'Arbitrum',
        subgraphEndpoint: 'https://api.thegraph.com/subgraphs/name/steerprotocol/steer-protocol-arbitrum',
        chainId: 42161,
        merkl: true,
        identifier: 'arbitrum'
    },
    {
        name: 'Optimism',
        subgraphEndpoint: 'https://api.thegraph.com/subgraphs/name/steerprotocol/steer-protocol-optimism',
        chainId: 10,
        merkl: true,
        identifier: 'optimism'
    },
    {
        name: 'Binance',
        subgraphEndpoint: 'https://api.thegraph.com/subgraphs/name/steerprotocol/steer-protocol-bsc',
        chainId: 56,
        merkl: false,
        identifier: 'bsc'
    },
    {
        name: 'Evmos',
        subgraphEndpoint: 'https://subgraph.satsuma-prod.com/769a117cc018/steer/steer-protocol-evmos/api',
        chainId: 9001,
        merkl: false,
        identifier: 'evmos'
    },
    {
        name: 'Avalanche',
        subgraphEndpoint: 'https://api.thegraph.com/subgraphs/name/rakeshbhatt10/avalance-test-subgraph',
        chainId: 43114,
        merkl: false,
        identifier: 'avax'
    },
    {
        name: 'Thundercore',
        subgraphEndpoint: 'http://52.77.49.1:8000/subgraphs/name/steerprotocol/steer-thundercore',
        chainId: 108,
        merkl: false,
        identifier: 'thundercore'
    }
]

// Fetch active vaults and associated data @todo limited to 1000 per chain
const query = `
{
    vaults(first: 1000, where: {totalLPTokensIssued_not: "0", lastSnapshot_not: "0"}) {
      weeklyFeeAPR
      beaconName
      feeTier
      id
      pool
      token0
      token0Symbol
      token0Decimals
      token1
      token1Symbol
      token1Decimals
      totalLPTokensIssued
      totalAmount1
      totalAmount0
      strategyToken {
        id
      }
    }
  }`


const getPools = async () => {
const pools = []

const stakingRewards = await axios.get('https://9i52h964s3.execute-api.us-east-1.amazonaws.com/dev/staking-pools')

for (const chainInfo of supportedChains) {
        // filter to this chains staking pools
        const localStakePools = stakingRewards.data.pools.filter((pool) => pool.chainID === chainInfo.chainId)
        const stakeRewardTokens = localStakePools.map((pool) => (chainInfo.identifier + ':' + pool.rewardToken).toLowerCase())
        const data = await request(chainInfo.subgraphEndpoint, query)
        // get tokens
        const tokenList = new Set(stakeRewardTokens)
        // this chain's pool's tokens
        data.vaults.forEach(vaultInfo => {
            tokenList.add((chainInfo.identifier + ':' + vaultInfo.token0).toLowerCase())
            tokenList.add((chainInfo.identifier + ':' + vaultInfo.token1).toLowerCase())
        })

        // get prices
        const coinRequest = `https://coins.llama.fi/prices/current/${Array.from(tokenList).toString()}`
        const response = (await axios.get(coinRequest))
        const tokenPrices = response.data.coins
        // const tokenPrices = (
        //     await superagent.post('https://coins.llama.fi/prices/current/').send({
        //         coins: Array.from(tokenList),
        //     })
        // ).body.coins;

        const incentivizedPools = []
        // get merkl rewards
        if (chainInfo.merkl) {
            const merklRequest = `https://api.angle.money/v1/merkl?chainId=${chainInfo.chainId}`
            const rewardInfo = await axios.get(merklRequest)

            Object.keys(rewardInfo.data.pools).forEach(function(key){
                // token listed is most recent distribution, may change over time
                const pool = rewardInfo.data.pools[key]

                const steerAPRs = Object.keys(pool.aprs).filter((manager)=>manager.includes('Steer'))
                incentivizedPools.push( steerAPRs.map((manager)=> {
                    // get vault directly
                    return {id: manager.slice(6), apr: pool.aprs[manager], token: pool.distributionData[pool.distributionData.length - 1].token} 
                }))

            })
        }

        const chainPools = await  Promise.all(data.vaults.map( async vault => {
            // calculate tvl
            const totalUSD0 = Number(vault.totalAmount0) * tokenPrices[`${chainInfo.identifier.toLowerCase()}:${vault.token0}`]?.price / (10 ** Number(vault.token0Decimals))
            const totalUSD1 = Number(vault.totalAmount1) * tokenPrices[`${chainInfo.identifier.toLowerCase()}:${vault.token1}`]?.price / (10 ** Number(vault.token1Decimals))
            const poolTvl = totalUSD0 + totalUSD1
            let rewardToken = null
            let rewardAPY = 0
            // find reward token / apy if applicable
            const rewardPool = incentivizedPools.find(pool => pool.id === vault.id.toLowerCase())
            if (rewardPool) {
                if (rewardPool.apr) {
                    rewardToken = rewardPool[0].token
                    rewardAPY = rewardPool[0].apr
                }
            }

            // get stake rewards
            let stakeRewardToken = null
            let percentageOfVaultStaked = 0
            let stakeRewardsUSD = 0
            let durationMultiplier = 0
            const stakePool = localStakePools.find(pool => pool.stakingToken.toLowerCase() === vault.id.toLowerCase())
            if (stakePool){
                // here we will need staked total supply vs vault total supply, rewards for duration
                const amountStaked = (
                    await api.abi.call({
                        target: stakePool,
                        abi: 'erc20:totalSupply',
                        chain: chainInfo.identifier as Chain,
                    })
                ).output
                const amountVault = (
                    await api.abi.call({
                        target: vault.id,
                        abi: 'erc20:totalSupply',
                        chain: chainInfo.identifier as Chain,
                    })
                ).output
                const amountRewardToken = (
                    await api.abi.call({
                        target: stakePool,
                        abi: abi['getRewardForDuration'],
                        chain: chainInfo.identifier as Chain,
                    })
                ).output
                stakeRewardToken = (
                    await api.abi.call({
                        target: stakePool,
                        abi: abi['rewardToken'],
                        chain: chainInfo.identifier as Chain,
                    })
                ).output
                const duration = (
                    await api.abi.call({
                        target: stakePool,
                        abi: abi['duration'],
                        chain: chainInfo.identifier as Chain,
                    })
                ).output
                const rewardDecimals = (
                    await api.abi.call({
                        target: stakeRewardToken,
                        abi: 'erc20:decimals',
                        chain: chainInfo.identifier as Chain,
                    })
                ).output
                percentageOfVaultStaked = (amountStaked / amountVault)
                percentageOfVaultStaked = percentageOfVaultStaked > 1 ? 0 : percentageOfVaultStaked
                const totalRewardsUSD = tokenPrices[`${chainInfo.identifier.toLowerCase()}:${stakeRewardToken}`]?.price / (10 ** Number(rewardDecimals))
                stakeRewardsUSD = amountRewardToken * totalRewardsUSD
                durationMultiplier = 31536000/ duration
            }

            // calculate apr
            let vaultApr = 0;
            const vaultSnapshots = await getSnapshotsFromSubgraph(vault.id.toLowerCase(), chainInfo.subgraphEndpoint)

            // filter to last 7 days or two snapshots
            let snapshots = filterSnapshotData(vaultSnapshots, Period.Week)
            if (snapshots.length !== 0) {
                const averageFeePerHoldingPerSecond = getAverageReturnPerSecondFromSnapshots(snapshots)
                vaultApr = averageFeePerHoldingPerSecond * YEAR_IN_SECONDS
            }

            if (Number.isFinite(poolTvl)) {
                let stakingAPY = 0
                if (stakePool) {
                    const stakeTVL = poolTvl * percentageOfVaultStaked
                    stakingAPY = (stakeRewardsUSD / stakeTVL) * durationMultiplier
                }
                const rewardTokens = [rewardToken, stakeRewardToken]

                return {
                    pool: (vault.id + '-' + chainInfo.name).toLowerCase(),
                    chain: chainInfo.name, // chain where the pool is (needs to match the `name` field in here https://api.llama.fi/chains)
                    project: 'steer-protocol', // protocol (using the slug again)
                    symbol: (vault.token0Symbol + '-' + vault.token1Symbol), // symbol of the tokens in pool, can be a single symbol if pool is single-sided or multiple symbols (eg: USDT-ETH) if it's an LP
                    tvlUsd: poolTvl, // number representing current USD TVL in pool
                    apyBase: vaultApr, // APY from pool fees/supplying in %
                    apyReward: (rewardAPY ?? 0) + stakingAPY,
                    rewardTokens: rewardTokens.filter(token => token !== null),
                    underlyingTokens: [vault.token0, vault.token1], // Array of underlying token addresses from a pool, eg here USDT address on ethereum
                    poolMeta: vault.beaconName,
                    url: `https://app.steer.finance/app/${vault.strategyToken.id}/vault/${vault.id}?engine=${vault.beaconName}&chainId=${chainInfo.chainId}`
                }
            }
            else {
                // if we have blownout ticks skip pool
                return null
            }

            
        }))
        pools.push(...(chainPools.filter((element) => element !== null)))

    };
    return pools
}

module.exports = {
    timetravel: false,
    apy: getPools,
  };