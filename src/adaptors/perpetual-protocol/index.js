const utils = require('../utils')

const sdk = require('@defillama/sdk');
const abi = require("./abi/QuoteVault")
const BN = require('bignumber.js');

async function getAssetTokenDecimal(vaultAssetToken) {
    const decimals = (
        await sdk.api.erc20.decimals(
            vaultAssetToken,
            "optimism"
        )
    ).output;
    return BN(decimals)
}

async function getTotalAssets(vault) {
    const totalAssets = (
        await sdk.api.abi.call({
            target: vault,
            abi: abi.find(x => x.name === "totalAssets"),
            chain: 'optimism',
        })
    ).output;
    return BN(totalAssets) // TVL
}

async function getTotalSupply() {
    const vaultToken = "0x83d6675FE072928132c1B98ca3647De2fA9c8d84"
    const totalSupply = (
        await sdk.api.erc20.totalSupply({
            target: vaultToken,
            chain: "optimism"
        })
    ).output;
    return BN(totalSupply)
}

async function getTvl() {
    // 1. get total asset in wei
    // 3. get decimal of asset token
    // 4. get total asset in amount
    // 5. multiply the price of token

    let vault = "0x748A38f4a430504Deb15fD5BB157dd466f8284B9";
    const vaultAssetToken = "0x7f5c764cbc14f9669b88837ca1490cca17c31607" // USDC on op

    const totalAsset = await getTotalAssets(vault)
    const decimals = await getAssetTokenDecimal(vaultAssetToken)
    const price = (await utils.getPrices([vaultAssetToken], "optimism")).pricesByAddress[vaultAssetToken];

    let n = BN(10).pow(decimals);
    let div = totalAsset.div(n);

    return div.times(price)
}


const poolsFunction = async () => {
    const tvl = await getTvl()
    console.log(tvl.toString())

    /* 6/15 16:00
     - USDC Vault
     - total asset: (TVL)    1050
     - total supply: (share) 1000
     // 1 share: 1.05

     6/16 16:00
     - USDC Vault
     - total asset: (TVL)    1065
     - total supply: (share) 1010
     // 1 share: 1.05445545

     6/16 - 6/15
     = 1.05445545 - 1.05 = 0.00445545 = APR ===> APY
    */

    /* 6/15 16:00
     - ETH Vault in wETH
     - total asset: (TVL)    1050
     - total supply: (share) 1000
     // 1 share: 1.05

     6/16 16:00
     - ETH Vault
     - total asset: (TVL)    1065
     - total supply: (share) 1010
     // 1 share: 1.05445545

     6/16 - 6/15
     = 1.05445545 - 1.05 = 0.00445545 = APR ===> APY
    */

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