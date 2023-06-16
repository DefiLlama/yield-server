const utils = require('../utils')

const sdk = require('@defillama/sdk');
const abi = require("./abi/QuoteVault")
const BN = require('bignumber.js');
const {getBlocksByTime} = require("../utils");

async function getDecimal(token) {
    const decimals = (
        await sdk.api.erc20.decimals(
            token,
            "optimism"
        )
    ).output;
    return BN(decimals)
}

async function getTotalAssets(vault, block) {
    const totalAssets = (
        await sdk.api.abi.call({
            target: vault,
            abi: abi.find(x => x.name === "totalAssets"),
            chain: 'optimism',
            block: block
        })
    ).output;
    return BN(totalAssets) // TVL
}

async function getTotalSupply(token, block) {
    const totalSupply = (
        await sdk.api.erc20.totalSupply({
            target: token,
            chain: "optimism",
            block: block
        })
    ).output;
    return BN(totalSupply)
}

async function getTvlInUsd(vault, vaultAssetToken, block) {
    const totalAssetX10d = await getTotalAssets(vault)
    const decimals = await getDecimal(vaultAssetToken)
    const price = (await utils.getPrices([vaultAssetToken], "optimism")).pricesByAddress[vaultAssetToken];

    const totalAsset = totalAssetX10d.div(BN(10).pow(decimals));

    return totalAsset.times(price).toNumber()
}

async function getApyInPercentage(vault, vaultAssetToken, vaultToken, blockNow, block24hrsAgo) { //ETH
    console.log({vault})

    const assetTokenDecimal = await getDecimal(vaultAssetToken)
    const vaultTokenDecimals = await getDecimal(vaultToken)

    const todayAssetX10d = await getTotalAssets(vault, blockNow)
    const todayAsset = todayAssetX10d.div(BN(10).pow(assetTokenDecimal))
    const todaySupplyX10d = await getTotalSupply(vaultToken, blockNow)
    const todaySupply = todaySupplyX10d.div(BN(10).pow(vaultTokenDecimals));  // total supply of USDC
    const todaySharePrice = todayAsset.div(todaySupply)
    console.log("today share", todaySharePrice.toString())

    const yesterdayAssetX10d = await getTotalAssets(vault, block24hrsAgo)
    const yesterdayAsset = yesterdayAssetX10d.div(BN(10).pow(assetTokenDecimal))
    const yesterdaySupplyX10d = await getTotalSupply(vaultToken, block24hrsAgo)
    const yesterdaySupply = yesterdaySupplyX10d.div(BN(10).pow(vaultTokenDecimals));  // total supply of USDC
    const yesterdaySharePrice = yesterdayAsset.div(yesterdaySupply)
    console.log("yesterday share", yesterdaySharePrice.toString())

    const apr = todaySharePrice.minus(yesterdaySharePrice).times(365)

    const aprInPercentage = apr.times(100);
    return utils.aprToApy(aprInPercentage.toNumber())
}


async function calculatePool(vault, vaultAssetToken, vaultToken) {
    const timestampNow = Math.floor(Date.now() / 1_000);
    const timestamp24hsAgo = timestampNow - 86_400;
    const [block24hrsAgo, blockNow] = await getBlocksByTime([timestamp24hsAgo, timestampNow], "optimism");

    const tvlInUsd = await getTvlInUsd(vault, vaultAssetToken, blockNow)
    const apyInUsd = await getApyInPercentage(vault, vaultAssetToken, vaultToken, blockNow, block24hrsAgo)
    return {tvlInUsd, apyInUsd};

    // return {
    //     // TODO: vault address
    //     pool: "0x3ed3b47dd13ec9a98b44e6204a523e766b225811-ethereum", // unique identifier for the pool in the form of: `${ReceivedTokenAddress}-${chain}`.toLowerCase()
    //     chain: "Optimism", // chain where the pool is (needs to match the `name` field in here https://api.llama.fi/chains)
    //     project: 'perpetual-protocol', // protocol (using the slug again)
    //     symbol: "USDT", // symbol of the tokens in pool, can be a single symbol if pool is single-sided or multiple symbols (eg: USDT-ETH) if it's an LP
    //     // TODO: how to fetch TVL?
    //     // call totalAsset method on contract divide decimal
    //     tvlUsd: 1000.1, // number representing current USD TVL in pool
    //     // how to fetch daily APY?
    //     apyBase: 0.5, // APY from pool fees/supplying in %
    //     apyReward: 0, // APY from pool LM rewards in %
    //     // todo: []
    //     rewardTokens: ['0x7Fc66500c84A76Ad7e9c93437bFc5Ac33E2DDaE9'], // Array of reward token addresses (you can omit this field if a pool doesn't have rewards)
    //     // todo: Optimism WETH/USDC
    //     underlyingTokens: ['0xdAC17F958D2ee523a2206206994597C13D831ec7'], // Array of underlying token addresses from a pool, eg here USDT address on ethereum
    //     poolMeta: "An on-chain vault that performs arbitrage in the ETH market",
    // };
}

const poolsFunction = async () => {
    const meta = await utils.getData("https://metadata.perp.exchange/kantaban/optimism.json");
    for (const {vault, vaultAsset, vaultToken} of meta.vaults) {
        const {tvlInUsd, apyInUsd} = await calculatePool(vault, vaultAsset, vaultToken);
        console.log({vault, tvl: tvlInUsd, apy: apyInUsd})
    }

    //
    // const vault = "0x748A38f4a430504Deb15fD5BB157dd466f8284B9";          // vault self
    // const vaultAssetToken = "0x7f5c764cbc14f9669b88837ca1490cca17c31607" // USDC on op
    // const vaultToken = "0x83d6675FE072928132c1B98ca3647De2fA9c8d84"      // supply token
    // const {tvlInUsd, apyInUsd} = await calculatePool(vault, vaultAssetToken, vaultToken);
    // console.log({tvl: tvlInUsd, apy: apyInUsd})



    const hotTubEthEth = {
        // TODO: vault address
        pool: "0x3ed3b47dd13ec9a98b44e6204a523e766b225811-ethereum", // unique identifier for the pool in the form of: `${ReceivedTokenAddress}-${chain}`.toLowerCase()
        chain: "Optimism", // chain where the pool is (needs to match the `name` field in here https://api.llama.fi/chains)
        project: 'perpetual-protocol', // protocol (using the slug again)
        symbol: "USDT", // symbol of the tokens in pool, can be a single symbol if pool is single-sided or multiple symbols (eg: USDT-ETH) if it's an LP
        // TODO: how to fetch TVL?
        // call totalAsset method on contract divide decimal
        tvlUsd: 1000.1, // number representing current USD TVL in pool
        // how to fetch daily APY?
        apyBase: 0.5, // APY from pool fees/supplying in %
        apyReward: 0, // APY from pool LM rewards in %
        // todo: []
        rewardTokens: ['0x7Fc66500c84A76Ad7e9c93437bFc5Ac33E2DDaE9'], // Array of reward token addresses (you can omit this field if a pool doesn't have rewards)
        // todo: Optimism WETH/USDC
        underlyingTokens: ['0xdAC17F958D2ee523a2206206994597C13D831ec7'], // Array of underlying token addresses from a pool, eg here USDT address on ethereum
        poolMeta: "An on-chain vault that performs arbitrage in the ETH market",
    };
    return [hotTubEthEth]

    const ustPool = {
        pool: 'terra1hzh9vpxhsk8253se0vv5jj6etdvxu3nv8z07zu',
        chain: utils.formatChain('terra'),
        project: 'perpetual-protocol',
        symbol: utils.formatSymbol('UST'),
        tvlUsd: 1000,
        apy: 100
    };

    return [ustPool]; // Anchor only has a single pool with APY
};

module.exports = {
    timetravel: false,
    apy: poolsFunction,
    url: 'https://app.anchorprotocol.com/#/earn',
};