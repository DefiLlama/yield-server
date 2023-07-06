const { gql, request } = require('graphql-request');
const sdk = require('@defillama/sdk');
const utils = require('../utils');
const superagent = require('superagent');
const { HttpRequest } = require('aws-sdk');
const axios = require('axios')

// add chain deployments and subgraph endpoints here
const supportedChains = [
    {   
        name: 'Polygon', 
        subgraphEndpoint: 'https://api.thegraph.com/subgraphs/name/steerprotocol/steer-protocol-polygon',
        chainId: 137
    },
    {
        name: 'Arbitrum',
        subgraphEndpoint: 'https://api.thegraph.com/subgraphs/name/steerprotocol/steer-protocol-arbitrum',
        chainId: 42161
    },
    {
        name: 'Optimism',
        subgraphEndpoint: 'https://api.thegraph.com/subgraphs/name/steerprotocol/steer-protocol-optimism',
        chainId: 10
    },
    {
        name: 'Binance',
        subgraphEndpoint: 'https://api.thegraph.com/subgraphs/name/steerprotocol/steer-protocol-bsc',
        chainId: 56
    },
    {
        name: 'Evmos',
        subgraphEndpoint: 'https://subgraph.satsuma-prod.com/769a117cc018/steer/steer-protocol-evmos/api',
        chainId: 9001
    },
    {
        name: 'Avalanche',
        subgraphEndpoint: 'https://api.thegraph.com/subgraphs/name/rakeshbhatt10/avalance-test-subgraph',
        chainId: 43114
    },
    {
        name: 'Thundercore',
        subgraphEndpoint: 'http://52.77.49.1:8000/subgraphs/name/steerprotocol/steer-thundercore',
        chainId: 108
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
supportedChains.forEach(async chainInfo => {
    const data = await request(chainInfo.subgraphEndpoint, query)
    // get tokens
    const tokenList = new Set()
    data.vaults.forEach(vaultInfo => {
        tokenList.add((chainInfo.name + ':' + vaultInfo.token0).toLowerCase())
        tokenList.add((chainInfo.name + ':' + vaultInfo.token1).toLowerCase())
    })

    // get prices
    const tokenPrices = (
        await superagent.post('https://coins.llama.fi/prices').send({
            coins: Array.from(tokenList),
        })
    ).body.coins;

    // fetch sushi reward info
    const sushiMerklRewardInfo = await axios.Axios.get(`https://pools.sushi.com/api/v0?&chainIds=${chainInfo.chainId}&isWhitelisted=true&orderBy=liquidityUSD&isIncentivized=true&orderDir=desc&protocols=SUSHISWAP_V3`)
    const incentivizedPools = sushiMerklRewardInfo.data.map((pool) => {
        return {id: pool.id, rewards: pool.incentives[0].rewardToken.address, apr: pool.incentives[0].apr}
    })
    const chainPools = data.vaults.map( vault => {
        // calculate tvl
        const totalUSD0 = Number(vault.totalAmount0) * tokenPrices[`${chainInfo.name.toLowerCase()}:${vault.token0}`]?.price / (10 ** Number(vault.token0Decimals))
        const totalUSD1 = Number(vault.totalAmount1) * tokenPrices[`${chainInfo.name.toLowerCase()}:${vault.token1}`]?.price / (10 ** Number(vault.token1Decimals))
        const poolTvl = totalUSD0 + totalUSD1
        let rewardToken = null
        let rewardAPY = null
        // find reward token / apy if applicable
        const rewardPool = incentivizedPools.filter(pool => pool.id.toLowerCase() === vault.id.toLowerCase())
        if (rewardPool.length) {
            rewardToken = rewardPool[0].rewards
            rewardAPY = rewardPool[0].apr
        }

        return {
            pool: (vault.id + '-' + chainInfo.name).toLowerCase(),
            chain: chainInfo.name, // chain where the pool is (needs to match the `name` field in here https://api.llama.fi/chains)
            project: 'steer-protocol', // protocol (using the slug again)
            symbol: (vault.token0Symbol + '-' + vault.token1Symbol), // symbol of the tokens in pool, can be a single symbol if pool is single-sided or multiple symbols (eg: USDT-ETH) if it's an LP
            tvlUsd: poolTvl, // number representing current USD TVL in pool
            apyBase: parseFloat(vault.weeklyFeeAPR), // APY from pool fees/supplying in %
            apyReward: rewardAPY,
            rewardTokens: [rewardToken],
            underlyingTokens: [vault.token0, vault.token1], // Array of underlying token addresses from a pool, eg here USDT address on ethereum
            poolMeta: vault.beaconName, 
            url: 'https://app.steer.finance/app/' + (vault.strategyToken.id) + '/vault/' + vault.id
        }
    })
    pools.push(...chainPools)

});
return pools
}

module.exports = {
    timetravel: false,
    apy: getPools,
  };