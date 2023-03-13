const utils = require("../utils")
const sdk = require('@defillama/sdk');
const abi = require("./abis.json");
const { formatChain, getData } = require("../utils")

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
            }
        ],
        formattedChainName: "Avalanche"
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
                address: "0x8D9bA570D6cb60C7e3e0F31343Efe75AB8E65FB1", // hETH ETH (50k)
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
                address: "0xE27BFf97CE92C3e1Ff7AA9f86781FDd6D48F5eE9", // hETH ETH (3m)
                underlyingTokenCount: 2
            },
            {
                address: "0xF44938b0125A6662f9536281aD2CD6c499F22004", // hUSD USDC (4m)
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
    const lpTokenSymbol = (await sdk.api.abi.call({ abi: abi.symbol, target: lpToken, chain: chain })).output; // dont need
    // const underlyingLpToken = (await sdk.api.abi.call({ abi: abi.token, target: lpToken, chain: chain })).output;
    const lpTokenDecimals = (await sdk.api.abi.call({ abi: abi.decimals, target: lpToken, chain: chain })).output;

    const allocPoint = await poolInfo.allocPoint;
    const totalAllocPoint = (await sdk.api.abi.call({ abi: abi.totalAllocPoint, target: LP_STAKING_ADDRESS, chain: chain })).output;

    const reserve = (await sdk.api.abi.call({ abi: abi.balanceOf, target: lpToken, chain: chain, params: LP_STAKING_ADDRESS })).output / (1 * 10 ** lpTokenDecimals); // is incorrect
    const synapsePerSecond = (await sdk.api.abi.call({ abi: abi.synapsePerSecond, target: LP_STAKING_ADDRESS, chain: chain })).output;

    return {
        lpToken,
        lpTokenSymbol,
        // underlyingLpToken,
        allocPoint,
        totalAllocPoint,
        reserve,
        synapsePerSecond,
    };
}

const tvl = async (chain, symbol, underlyingLpToken, reserve) => {
    // total number of coins in pool * coin price
    const price = (await getPrices(chain, [underlyingLpToken]))[token.toLowerCase()];
    const reserveUSD = reserve * price;

    return reserveUSD;
}

const main = async () => {
    let allPools = []
    for (let x =0; x < chainNames.length; x++) {
        const chainKey = chainNames[x].toLowerCase()
        const configPerChain = config[chainNames[x]]

        if (chainKey !== "arbitrum") {
            continue;
        }

        const LP_STAKING_ADDRESS = configPerChain.LP_STAKING_ADDRESS
        const SYN_TOKEN_ADDRESS = configPerChain.SYN_TOKEN_ADDRESS

        const poolLength = parseInt((await sdk.api.abi.call({ abi: abi.poolLength, target: LP_STAKING_ADDRESS, chain: chainKey })).output)
        
        const allLpTokens = (
            await sdk.api.abi.multiCall({
              calls: configPerChain.Pools.map(poolData => ({ target: poolData.address})),
              abi: abi.swapStorage,
              chain: chainKey,
            })
        ).output.map(data => ({lpToken: data.output.lpToken, poolAddress: data.input.target}))//.map(({ output }) => output);

        console.log(allLpTokens)
        for (let y = 0; y < poolLength; y++) {
            console.log(`chain ${chainKey} | y ${y}`)

            const relevantInfo = await relevantPoolInfo(y, chainKey, LP_STAKING_ADDRESS)
            console.log(`chain ${chainKey} | y ${y} | rel`)

            let tvl = relevantInfo.reserve

            // Pools can either be stablecoin pools (tvl = tokens) or eth pools (tvl = tokens * ethPrice)
            if (relevantInfo.lpTokenSymbol.toLowerCase().indexOf("usd") === -1 ) {
                tvl *= 1400 //await getPrices(chainKey, []) 
            }

            const apy = calcApy(1, tvl, relevantInfo.synapsePerSecond / (1 * 10 ** 18), relevantInfo.totalAllocPoint, relevantInfo.allocPoint)


            allPools.push({
                pool: `${relevantInfo.lpToken}-${utils.formatChain(chainKey)}`.toLowerCase(),
                chain: configPerChain.formattedChainName ? configPerChain.formattedChainName : utils.formatChain(chainKey),
                symbol: relevantInfo.lpTokenSymbol,
                project: 'synapse',
                tvlUsd: tvl,
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

/*

Go through all the pools and get their token and token balances
After multicalling all of that, make a bulk request per chain to have cached results for pricing for each token
    keep in mind that we cannot calculate for nUSD and nETH so just set that value to the same as ETH

*/