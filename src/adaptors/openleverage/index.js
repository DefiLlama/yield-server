const sdk = require('@defillama/sdk');
const erc20 = require("./abis/erc20.json");
const LPool = require("./abis/LPool.json");
const OplContract = require("./abis/OplContract.json");
const axios = require("axios");
const utils = require('../utils');
const {default: BigNumber} = require('bignumber.js');

openleve_address = {
    "eth": '0x03bf707deb2808f711bb0086fc17c5cafa6e8aaf',
    "bsc": '0x6A75aC4b8d8E76d15502E69Be4cb6325422833B4',
    "arb": '0x2925671dc7f2def9e4ad3fa878afd997f0b4db45'
}

llama_chain_name = {
    "bsc": "Binance",
    "arb": "Arbitrum",
    "eth": "Ethereum"
}

coins_llama_name = {
    "bsc": "bsc",
    "arb": "arbitrum",
    "eth": "ethereum"
}

opl_chain_name = {
    "bsc": "bnb",
    "arb": "arbitrum",
    "eth": "eth"
}

block_of_year = {
    "eth": 2102400,
    "bsc": 10512000,
    "arb": 2628000
}

oleAddr = {
    "eth": "0x92cfbec26c206c90aee3b7c66a9ae673754fab7e",
    "bsc": "0xa865197a84e780957422237b5d152772654341f3",
    "arb": "0xd4d026322c88c2d49942a75dff920fcfbc5614c1"
}


async function getTokenPriceInUsdt(chain, tokenAddr) {
    const tokenPrice = (
        await axios.get(
            `https://coins.llama.fi/prices/current/${coins_llama_name[chain]}:${tokenAddr}`
        )
    ).data;
    return tokenPrice.coins[`${coins_llama_name[chain]}:${tokenAddr}`].price;
}


async function getPoolInfo(chain) {
    const poolInfo = await axios.get(`https://${opl_chain_name[chain]}.openleverage.finance/api/info/pools/interest`)
    return poolInfo
}


async function getDecimals(addr, chain, abi) {
    const decimals = (
        await sdk.api.abi.call({
            abi: abi,
            target: addr,
            chain: coins_llama_name[chain]
        })
    ).output;
    return decimals;
}

async function getSymbol(addr, chain) {
    const decimals = (
        await sdk.api.abi.call({
            abi: erc20.symbol,
            target: addr,
            chain: coins_llama_name[chain]
        })
    ).output;
    return decimals;
}

const main = async () => {
    const result = []
    for (const chain of Object.keys(openleve_address)) {
        const poolInfo = await getPoolListByUrl(chain);
        for (const pool of Object.keys(poolInfo)) {
            const poolDetails = poolInfo[pool]
            const poolBalance = (
                await sdk.api.abi.call({
                    abi: erc20.balanceOf,
                    target: poolDetails.token,
                    chain: coins_llama_name[chain],
                    params: pool
                })
            ).output;
            const totalBorrow = (
                await sdk.api.abi.call({
                    abi: LPool.totalBorrows,
                    target: pool,
                    chain: coins_llama_name[chain]
                })
            ).output;
            const poolAPYPerBlock = (
                await sdk.api.abi.call({
                    abi: LPool.supplyRatePerBlock,
                    target: pool,
                    chain: coins_llama_name[chain]
                })
            ).output;

            let tokenPriceInUsdt = 0;
            try {
                tokenPriceInUsdt = await getTokenPriceInUsdt(chain, poolDetails.token);
            } catch (e) {
                // console.error(e)
            }

            const poolValues = {
                pool: `${pool}-${llama_chain_name[chain]}`.toLowerCase(),
                chain: utils.formatChain(llama_chain_name[chain]),
                project: 'openleverage',
                symbol: utils.formatSymbol(poolDetails.name).split("->")[0],
                tvlUsd: (new BigNumber(poolBalance)).multipliedBy(new BigNumber(tokenPriceInUsdt)).dividedBy(new BigNumber(10).pow(poolDetails.tokenDecimal)).toNumber(),
                apyBase: new BigNumber(poolAPYPerBlock).multipliedBy(new BigNumber(block_of_year[chain])).dividedBy(new BigNumber(10).pow(16)).toNumber(), // in % format
                url: `https://${opl_chain_name[chain]}.openleverage.finance/app/pool/${pool}`,
                apyReward: poolDetails.lendOleRewardApy * 100,
                rewardTokens: [poolDetails.token, oleAddr[chain]],
                underlyingTokens: [poolDetails.token],
                poolMeta: `${utils.formatSymbol(poolDetails.name)} Market`
            };
            console.log(poolValues)
            result.push(poolValues)
        }
    }

    return result
}


async function getPoolListByUrl(chain) {
    const poolList = (await getPoolInfo(chain)).data
    let pools = {}
    for (let i=0; i< poolList.length; i++ ){
        if (poolList[i].tvl > 8000){
            const token0Decimal = await getDecimals(poolList[i].token0Address, chain, erc20.decimals);
            const token0Symbol = await getSymbol(poolList[i].token0Address, chain);
            let poolInfo = {}
            poolInfo["name"] = poolList[i].poolName
            poolInfo["token"] = poolList[i].token0Address
            poolInfo["symbol"] = token0Symbol
            poolInfo["tokenDecimal"] = token0Decimal
            poolInfo["lendOleRewardApy"] = poolList[i].lendOleRewardApy
            pools[poolList[i].poolAddress] = poolInfo
            console.log(`Pool ${poolList[i].poolName}(${poolList[i].poolAddress}) on Chain ${chain} TVL > 8000`)
        }
    }
    return pools;
}

async function getPoolListByContract(chain) {
    const numPairs = (
        await sdk.api.abi.call({
            abi: OplContract.numPairs,
            target: openleve_address[chain],
            chain: coins_llama_name[chain]
        })
    ).output;

    let pools = {}
    for (var i = 0; i < numPairs; i++) {
        const market = (
            await sdk.api.abi.call({
                abi: OplContract.markets,
                target: openleve_address[chain],
                chain: coins_llama_name[chain],
                params: i
            })
        ).output;
        const token0Decimal = await getDecimals(market.token0, chain, erc20.decimals);
        const token1Decimal = await getDecimals(market.token1, chain, erc20.decimals);

        const token0Symbol = await getSymbol(market.token0, chain);
        const token1Symbol = await getSymbol(market.token1, chain);
        let poolInfo = {}
        poolInfo["name"] = `${token0Symbol}`
        poolInfo["token"] = market.token0
        poolInfo["symbol"] = token0Symbol
        poolInfo["tokenDecimal"] = token0Decimal
        pools[market.pool0] = poolInfo

        poolInfo = {}
        poolInfo["name"] = `${token1Symbol}`
        poolInfo["token"] = market.token1
        poolInfo["symbol"] = token1Symbol
        poolInfo["tokenDecimal"] = token1Decimal
        pools[market.pool1] = poolInfo

    }
    return pools

}

module.exports = {
    timetravel: false,
    apy: main, // Main function, returns pools
    url: 'https://openleverage.finance/',
};


