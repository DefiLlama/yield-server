import { getSnapshotsFromSubgraph, filterSnapshotData, Period, getAverageReturnPerSecondFromSnapshots, YEAR_IN_SECONDS } from "./returnHelper";

// const { gql, request } = require('graphql-request');
import {request} from 'graphql-request'
// const sdk = require('@defillama/sdk');
// const utils = require('../utils');
// import {superagent} from 'superagent'
// const superagent = require('superagent');
// const { HttpRequest } = require('aws-sdk');
import axios from 'axios';

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
    vaults(first: 1000, where: {totalLPTokensIssued_not: "0"}) {
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

for (const chainInfo of supportedChains) {
        const data = await request(chainInfo.subgraphEndpoint, query)
        // get tokens
        const tokenList = new Set()
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
        if (chainInfo.merkl) {
            const merklRequest = `https://api.angle.money/v1/merkl?chainId=${chainInfo.chainId}`
            const rewardInfo = await axios.get(merklRequest)


            Object.keys(rewardInfo.data.pools).forEach(function(key){
                // token listed is most recent distribution, may change over time
                const pool = rewardInfo.data.pools[key]
                incentivizedPools.push( {pool: pool.pool, apr: pool.aprs['Average APR (rewards / pool TVL)'], token: pool.distributionData[pool.distributionData.length - 1].token} )
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
            const rewardPool = incentivizedPools.filter(pool => pool.pool.toLowerCase() === vault.pool.toLowerCase())
            if (rewardPool.length) {
                if (rewardPool[0].token) {
                    rewardToken = rewardPool[0].token
                    rewardAPY = rewardPool[0].apr
                }
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

            return {
                pool: (vault.id + '-' + chainInfo.name).toLowerCase(),
                chain: chainInfo.name, // chain where the pool is (needs to match the `name` field in here https://api.llama.fi/chains)
                project: 'steer-protocol', // protocol (using the slug again)
                symbol: (vault.token0Symbol + '-' + vault.token1Symbol), // symbol of the tokens in pool, can be a single symbol if pool is single-sided or multiple symbols (eg: USDT-ETH) if it's an LP
                tvlUsd: poolTvl, // number representing current USD TVL in pool
                apyBase: vaultApr, // APY from pool fees/supplying in %
                apyReward: rewardAPY,
                rewardTokens: rewardToken == null ? [] : [rewardToken],
                underlyingTokens: [vault.token0, vault.token1], // Array of underlying token addresses from a pool, eg here USDT address on ethereum
                poolMeta: vault.beaconName,
                url: `https://app.steer.finance/app/${vault.strategyToken.id}/vault/${vault.id}?engine=${vault.beaconName}&chainId=${chainInfo.chainId}`
            }
        }))
        pools.push(...(chainPools))

    };
    return pools
}

module.exports = {
    timetravel: false,
    apy: getPools,
  };