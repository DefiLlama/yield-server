const sdk = require('@defillama/sdk');
const erc20 = require("./abis/erc20.json");
const LPool = require("./abis/LPool.json");
const OplContract = require("./abis/OplContract.json");
const axios = require("axios");
const utils = require('../utils');

openleve_address = {
    "eth": '0x03bf707deb2808f711bb0086fc17c5cafa6e8aaf',
    "bsc": '0x6A75aC4b8d8E76d15502E69Be4cb6325422833B4'
}

chain_name = {
    "bsc": "bnb",
    "eth": "eth"
}

block_of_year = {
    "eth": 2102400,
    "bsc": 10512000
}

subgraph_endpoint = {
    "eth": 'https://api.thegraph.com/subgraphs/name/openleveragedev/openleverage',
    "bsc": 'https://api.thegraph.com/subgraphs/name/openleveragedev/openleverage-bsc'
}

async function getTokenPriceInUsdt(chain, tokenAddr) {
    const tokenPrice = (
        await axios.get(
            `https://coins.llama.fi/prices/current/${chain}:${tokenAddr}`
        )
    ).data;
    return tokenPrice.coins[`${chain}:${tokenAddr}`].price;
}


async function getDecimals(addr, chain, abi) {
    const decimals = (
        await sdk.api.abi.call({
            abi: abi,
            target: addr,
            chain: chain
        })
    ).output;
    return decimals;
}

async function getSymbol(addr, chain) {
    const decimals = (
        await sdk.api.abi.call({
            abi: erc20.symbol,
            target: addr,
            chain: chain
        })
    ).output;
    return decimals;
}

async function bsc_tvl() {
    const poolInfo = await getPoolList("bsc");
    const balances = {}
    for (const pool of Object.keys(poolInfo)) {
        const poolDetails = poolInfo[pool]
        console.log(poolDetails)
        const poolBalance = (
            await sdk.api.abi.call({
                abi: erc20.balanceOf,
                target: poolDetails.token,
                chain: 'bsc',
                params: pool
            })
        ).output;
        const poolAPYPerBlock = (
            await sdk.api.abi.call({
                abi: LPool.supplyRatePerBlock,
                target: pool,
                chain: 'bsc'
            })
        ).output;
        console.log(pool, poolBalance, poolAPYPerBlock * block_of_year["bsc"])

        let tokenPriceInUsdt = 0;
        try {
            tokenPriceInUsdt = await getTokenPriceInUsdt("bsc", poolDetails.token);
        } catch (e) {
            // console.error(e)
        }
        console.log(poolDetails.token, tokenPriceInUsdt)
        const poolValues = {
            pool: `${pool}-BNB`.toLowerCase(),
            chain: utils.formatChain("Binance"),
            project: 'openleverage',
            symbol: utils.formatSymbol(poolDetails.name),
            tvlUsd: poolBalance * tokenPriceInUsdt / Math.pow(10, poolDetails.decimal),
            apy: poolAPYPerBlock * block_of_year["bsc"] / Math.pow(10, poolDetails.decimal) * 100,
            url: `https://bnb.openleverage.finance/app/pool/${pool}`
        };
        console.log(poolValues)
    }
    return balances
}


async function getPoolList(chain) {
    const numPairs = (
        await sdk.api.abi.call({
            abi: OplContract.numPairs,
            target: openleve_address[chain],
            chain: 'bsc'
        })
    ).output;

    let pools = {}
    // for (var i = 0; i < numPairs; i++) {
    for (var i = 0; i < 20; i++) {
        const market = (
            await sdk.api.abi.call({
                abi: OplContract.markets,
                target: openleve_address[chain],
                chain: 'bsc',
                params: i
            })
        ).output;
        const token0Decimal = await getDecimals(market.token0, chain, erc20.decimals);
        const token1Decimal = await getDecimals(market.token1, chain, erc20.decimals);

        const token0Symbol = await getSymbol(market.token0, chain);
        const token1Symbol = await getSymbol(market.token1, chain);
        let poolInfo = {}
        poolInfo["name"] = `${token0Symbol}-${token1Symbol} lending`
        poolInfo["token"] = market.token0
        poolInfo["symbol"] = token0Symbol
        poolInfo["decimal"] = token0Decimal
        pools[market.pool0] = poolInfo

        poolInfo = {}
        poolInfo["name"] = `${token1Symbol}-${token0Symbol}`
        poolInfo["token"] = market.token1
        poolInfo["symbol"] = token1Symbol
        poolInfo["decimal"] = token1Decimal
        pools[market.pool1] = poolInfo

    }
    return pools

}


bsc_tvl()


