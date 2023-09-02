const sdk = require('@defillama/sdk4');
const abi = require("./abis.json");
const { formatChain, getData } = require("../utils")
const _ = require("lodash")

// Pools are the treasurys that hold the underlying assets
const config = {
    Arbitrum: {
        SYN_TOKEN_ADDRESS: "0x080F6AEd32Fc474DD5717105Dba5ea57268F46eb",
        LP_STAKING_ADDRESS: "0x73186f2Cf2493f20836b17b21ae79fc12934E207",
        Pools: [
            {
                address: "0xa067668661C84476aFcDc6fA5D758C4c01C34352", // nETH - WETH (8m)
                underlyingTokenCount: 2
            },
            {
                address: "0x9Dd329F5411466d9e0C488fF72519CA9fEf0cb40", // 3Pool (USDC - USDT - nUSD) (12m)
                underlyingTokenCount: 3
            },
            {
                address: "0x0Db3FE3B770c95A0B99D1Ed6F2627933466c0Dd8", // nETH - WETH (8m)
                underlyingTokenCount: 4
            },
        ]
    },
    Avax: {
        SYN_TOKEN_ADDRESS: "0x1f1E7c893855525b303f99bDF5c3c05Be09ca251",
        LP_STAKING_ADDRESS: "0x3a01521F8E7F012eB37eAAf1cb9490a5d9e18249",
        Pools: [
            {
                address: "0xED2a7edd7413021d440b09D654f3b87712abAB66", // nUSD, DAI, USDC, USDT (10m)
                underlyingTokenCount: 4 
            },
            {
                address: "0x77a7e60555bC18B4Be44C181b2575eee46212d44", // avWETH, nETH (6m)
                underlyingTokenCount: 2
            }
        ],
        formattedChainName: "Avalanche"
    },
    Base: {
        SYN_TOKEN_ADDRESS: "0x432036208d2717394d2614d6697c46DF3Ed69540",
        LP_STAKING_ADDRESS: "0xfFC2d603fde1F99ad94026c00B6204Bb9b8c36E9",
        Pools: [
            {
                address: "0x6223bD82010E2fB69F329933De20897e7a4C225f", // nETH ETH (13m)
                underlyingTokenCount: 2
            }
        ]
    },
    Ethereum: {
        SYN_TOKEN_ADDRESS: "0x0f2D719407FdBeFF09D87557AbB7232601FD9F29",
        LP_STAKING_ADDRESS: "0xd10eF2A513cEE0Db54E959eF16cAc711470B62cF",
        Pools: [
            {
                address: "0x1116898DdA4015eD8dDefb84b6e8Bc24528Af2d8", // DAI, USDC, USDT (17m)
                underlyingTokenCount: 3
            }
        ]
    },
    Fantom: {
        SYN_TOKEN_ADDRESS: "0xE55e19Fb4F2D85af758950957714292DAC1e25B2",
        LP_STAKING_ADDRESS: "0xaed5b25be1c3163c907a471082640450f928ddfe",
        Pools: [
            {
                address: "0x8D9bA570D6cb60C7e3e0F31343Efe75AB8E65FB1", // nETH ETH (50k)
                underlyingTokenCount: 2
            },
            {
                address: "0x85662fd123280827e11C59973Ac9fcBE838dC3B4", // 3pool nUSD USDC USDT (5m)
                underlyingTokenCount: 3
            },
            {
                address: "0x2913E812Cf0dcCA30FB28E6Cac3d2DCFF4497688", // Legacy stableswap USDC USDT MIM nUSD (600k)
                underlyingTokenCount: 4
            }
        ],
    },
    Optimism: {
        SYN_TOKEN_ADDRESS: "0x5A5fFf6F753d7C11A56A52FE47a177a87e431655",
        LP_STAKING_ADDRESS: "0xe8c610fcb63A4974F02Da52f0B4523937012Aaa0",
        Pools: [
            {
                address: "0xE27BFf97CE92C3e1Ff7AA9f86781FDd6D48F5eE9", // nETH ETH (3m)
                underlyingTokenCount: 2
            },
            {
                address: "0xF44938b0125A6662f9536281aD2CD6c499F22004", // nUSD USDC (4m)
                underlyingTokenCount: 2
            }
        ]
    },
    Polygon: {
        SYN_TOKEN_ADDRESS: "0xf8F9efC0db77d8881500bb06FF5D6ABc3070E695",
        LP_STAKING_ADDRESS: "0x7875Af1a6878bdA1C129a4e2356A3fD040418Be5",
        Pools: [
            {
                address: "0x85fCD7Dd0a1e1A9FCD5FD886ED522dE8221C3EE5", // USDC USDT nUSDC DAI (8m)
                underlyingTokenCount: 4
            }
        ]
    },    
}

const chainNames = Object.keys(config)

const calcApy = (priceOfSyn, tvl, synapsePerSecond, totalAllocPoint, poolAllocPoint) => {
    // # Calculate the annualized rewards for this pool
    pool_rewards = (synapsePerSecond * (poolAllocPoint / totalAllocPoint)) * 60 * 60 * 24 * 365

    // # Calculate the APY
    apy = (pool_rewards * priceOfSyn) / tvl
    
    return apy * 100
}

const getPrices = async (chain, addresses) => {
    const prices = (await getData(`https://coins.llama.fi/prices/current/${addresses.map((address) => `${chain}:${address}`)}`)).coins;

    const pricesObj = Object.entries(prices).reduce(
        (acc, [address, price]) => ({
            ...acc,
            [address.split(':')[1].toLowerCase()]: price.price,
        }),
        {}
    );

    return pricesObj;
};

const relevantPoolInfo = async (poolIndex, chain, LP_STAKING_ADDRESS) => {

    // info for tvl / apy calculations
    const poolInfo = (await sdk.api.abi.call({ abi: abi.poolInfo, target: LP_STAKING_ADDRESS, chain: chain, params: poolIndex })).output;
    const lpToken = (await sdk.api.abi.call({ abi: abi.lpToken, target: LP_STAKING_ADDRESS, chain: chain, params: poolIndex })).output;
    const allocPoint = await poolInfo.allocPoint;

    return {
        lpToken,
        allocPoint,
    };
}

const getTvl = async (chain, underlyingAssetsTreasury, lpToken, underlyingTokenCount) => {
    const allUnderlyingTokenAddresses = (
        // get all the tokens underlying the LP
        await sdk.api.abi.multiCall({
          calls: _.map(_.range(0,underlyingTokenCount), (index) => ({target: underlyingAssetsTreasury, params: [index]})),
          abi: abi.getToken,
          chain: chain,
        })
    ).output.map(({ output }) => output);

    const tokenPrices = await getPrices(chain, allUnderlyingTokenAddresses)


    // get all the token balances underlying the LP
    const allUnderlyingTokenBalances = (
        await sdk.api.abi.multiCall({
          calls: _.map(_.range(0,underlyingTokenCount), (index) => ({target: underlyingAssetsTreasury, params: [index]})),
          abi: abi.getTokenBalance,
          chain: chain,
        })
    ).output.map(({ output }) => output);

    // get decimals to correct the returned balances
    const allUnderlyingTokenDecimals = (
        await sdk.api.abi.multiCall({
          calls: allUnderlyingTokenAddresses.map(tokenAddress => ({target: tokenAddress})),
          abi: abi.decimals,
          chain: chain,
        })
    ).output.map(({ output }) => output);


    // get decimals to correct the returned balances
    const allUnderlyingTokenSymbols = (
        await sdk.api.abi.multiCall({
            calls: allUnderlyingTokenAddresses.map(tokenAddress => ({target: tokenAddress})),
            abi: abi.symbol,
            chain: chain,
        })
    ).output.map(({ output }) => output);

    let tvl = 0;
    for (let i = 0; i < allUnderlyingTokenAddresses.length; i++) {
        const tokenAddress = allUnderlyingTokenAddresses[i];
        const balance = parseFloat(allUnderlyingTokenBalances[i]) / (1 * 10 ** parseInt(allUnderlyingTokenDecimals[i]));
        let price = tokenPrices[tokenAddress.toLowerCase()];
        if (!price) {
            // hETH or hUSD will not be found in tokenPrices so we use the average price to dictate its price
            price = Object.values(tokenPrices).reduce((acc, curr) => acc + curr, 0) / Object.values(tokenPrices).length;
        }
        const value = balance * price;
        tvl += value;
    }

    return {tvlUsd: tvl, underlyingTokens: allUnderlyingTokenAddresses, allUnderlyingTokenSymbols}
}

const main = async () => {
    let allPools = []
    const synPrice = Object.values(await getPrices("Ethereum", [config.Ethereum.SYN_TOKEN_ADDRESS]))[0]

    for (let x =0; x < chainNames.length; x++) {
        const chainKey = chainNames[x].toLowerCase()
        const configPerChain = config[chainNames[x]]

        const LP_STAKING_ADDRESS = configPerChain.LP_STAKING_ADDRESS
        const SYN_TOKEN_ADDRESS = configPerChain.SYN_TOKEN_ADDRESS

        const totalAllocPoint = (await sdk.api.abi.call({ abi: abi.totalAllocPoint, target: LP_STAKING_ADDRESS, chain: chainKey })).output;
        const synapsePerSecond = (await sdk.api.abi.call({ abi: abi.synapsePerSecond, target: LP_STAKING_ADDRESS, chain: chainKey })).output;
        const poolLength = parseInt((await sdk.api.abi.call({ abi: abi.poolLength, target: LP_STAKING_ADDRESS, chain: chainKey })).output)

        const allLpTokens = (
            await sdk.api.abi.multiCall({
              calls: configPerChain.Pools.map(poolData => ({ target: poolData.address})),
              abi: abi.swapStorage,
              chain: chainKey,
            })
        ).output.map(data => ({lpToken: data.output.lpToken, poolAddress: data.input.target, underlyingTokenCount: (configPerChain.Pools.find(poolData => poolData.address ===  data.input.target)).underlyingTokenCount}))

        for (let y = 0; y < poolLength; y++) {

            // For each pool index, we have to see if we have info about it.
            // if so, we can get the tvl for the chain and move from there
            // if not, keep going

            const relevantInfo = await relevantPoolInfo(y, chainKey, LP_STAKING_ADDRESS)
            const underlyingAssetsTreasury = allLpTokens.find(x => x.lpToken === relevantInfo.lpToken)

            // We are excluding some of the low tvl pools that are onchain but not shown on web app
            // If you want to include these, add it to the config var
            if (!underlyingAssetsTreasury) { continue } 

            const {tvlUsd,underlyingTokens, allUnderlyingTokenSymbols} = await getTvl(chainKey, underlyingAssetsTreasury.poolAddress, underlyingAssetsTreasury.lpToken, underlyingAssetsTreasury.underlyingTokenCount, synPrice)
            const apy = calcApy(synPrice, tvlUsd, synapsePerSecond / (1 * 10 ** 18), totalAllocPoint, relevantInfo.allocPoint)

            allPools.push({
                pool: `${relevantInfo.lpToken}-${formatChain(chainKey)}`.toLowerCase(),
                chain: configPerChain.formattedChainName ? configPerChain.formattedChainName : formatChain(chainKey),
                symbol: allUnderlyingTokenSymbols.join("-"),
                project: 'synapse',
                underlyingTokens,
                tvlUsd,
                apy
            })
        }
    }

    return allPools
}

module.exports = {
    url: "https://synapseprotocol.com/pools",
    timetravel: false,
    apy: main,
};