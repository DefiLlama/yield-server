

const axios = require('axios');
const sdk = require('@defillama/sdk');


//Calculate APR function uses the last 45 days of rewards to calculate yield
//Yield token is traded 1:1 with the stablecoin and is not dual sided.

const PoolHolder = [
    {
        chain: 'Base',
        vaultName: 'USDC (MORTGAGEFI-USDC-WETH)',
        poolAddress: '0x1bE87D273d47C3832Ab7853812E9A995A4DE9EEA',
        stableAddress: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
        stableDecimals: 6,
        collateralAddress: '0x4200000000000000000000000000000000000006',
        collateralDecimals: 18,
    },
    {
        chain: 'Base',
        vaultName: 'USDC (MORTGAGEFI-USDC-cbBTC)',
        poolAddress: '0xE93131620945A1273b48F57f453983d270b62DC7',
        stableAddress: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
        stableDecimals: 6,
        collateralAddress: '0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf',
        collateralDecimals: 8,
    },
    {
        chain: 'Arbitrum',
        vaultName: 'USDT (MORTGAGEFI-USDT-WBTC)',
        poolAddress: '0x9Be2Cf73E62DD3b5dF4334D9A36888394822A33F',
        stableAddress: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9',
        stableDecimals: 6,
        collateralAddress: '0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f',
        collateralDecimals: 8,
    }
]
const aprAbi = {
    "inputs": [],
    "name": "calculateAPR",
    "outputs": [
        {
            "internalType": "uint256",
            "name": "apr",
            "type": "uint256"
        }
    ],
    "stateMutability": "view",
    "type": "function"
}

const apy = async () => {
    let baseCalls = [];
    let arbitrumCalls = [];
    let usdcWethVault = PoolHolder[0];
    let usdcCbBtcVault = PoolHolder[1];
    let usdtWbtcVault = PoolHolder[2];
    const allPrices = await axios.get(`https://coins.llama.fi/prices/current/base:${usdcWethVault.collateralAddress},base:${usdcWethVault.stableAddress},base:${usdcCbBtcVault.collateralAddress},base:${usdcCbBtcVault.stableAddress},arbitrum:${usdtWbtcVault.collateralAddress},arbitrum:${usdtWbtcVault.stableAddress}`);

    baseCalls.push({
        target: usdcCbBtcVault.poolAddress,
    },
        {
            target: usdcWethVault.poolAddress,
        },
    );
    arbitrumCalls.push({
        target: usdtWbtcVault.poolAddress,
    });

    let baseBalanceCalls = [];
    let arbitrumBalanceCalls = [];
    baseBalanceCalls.push(
        {
            target: usdcCbBtcVault.collateralAddress,
            params: usdcCbBtcVault.poolAddress,
        },
        {
            target: usdcCbBtcVault.stableAddress,
            params: usdcCbBtcVault.poolAddress,
        },
        {
            target: usdcWethVault.collateralAddress,
            params: usdcWethVault.poolAddress,
        },
        {
            target: usdcWethVault.stableAddress,
            params: usdcWethVault.poolAddress,
        });

    arbitrumBalanceCalls.push({
        target: usdtWbtcVault.collateralAddress,
        params: usdtWbtcVault.poolAddress,
    }, {
        target: usdtWbtcVault.stableAddress,
        params: usdtWbtcVault.poolAddress,
    });
    const baseBalances = await sdk.api.abi.multiCall({
        calls: baseBalanceCalls,
        abi: 'erc20:balanceOf',
        chain: 'base',
    });
    const arbitrumBalances = await sdk.api.abi.multiCall({
        calls: arbitrumBalanceCalls,
        abi: 'erc20:balanceOf',
        chain: 'arbitrum',
    });
    const baseApys = await sdk.api.abi.multiCall({
        calls: baseCalls,
        abi: aprAbi,
        chain: 'base',
    });
    const arbitrumApys = await sdk.api.abi.multiCall({
        calls: arbitrumCalls,
        abi: aprAbi,
        chain: 'arbitrum',
    });

    const wethCollateralBalance = allPrices.data.coins[`base:${usdcWethVault.collateralAddress}`].price * (Number(baseBalances.output[2].output) / 10 ** usdcWethVault.collateralDecimals);
    const wethStableBalance = allPrices.data.coins[`base:${usdcWethVault.stableAddress}`].price * (Number(baseBalances.output[3].output) / 10 ** usdcWethVault.stableDecimals);
    const wethTVL = wethCollateralBalance + wethStableBalance;
    const cbBtcCollateralBalance = allPrices.data.coins[`base:${usdcCbBtcVault.collateralAddress}`].price * (Number(baseBalances.output[0].output) / 10 ** usdcCbBtcVault.collateralDecimals);
    const cbBtcStableBalance = allPrices.data.coins[`base:${usdcCbBtcVault.stableAddress}`].price * (Number(baseBalances.output[1].output) / 10 ** usdcCbBtcVault.stableDecimals);
    const cbBtcTVL = cbBtcCollateralBalance + cbBtcStableBalance;
    const wbtcCollateralBalance = allPrices.data.coins[`arbitrum:${usdtWbtcVault.collateralAddress}`].price * (Number(arbitrumBalances.output[0].output) / 10 ** usdtWbtcVault.collateralDecimals);
    const wbtcStableBalance = allPrices.data.coins[`arbitrum:${usdtWbtcVault.stableAddress}`].price * (Number(arbitrumBalances.output[1].output) / 10 ** usdtWbtcVault.stableDecimals);
    const wbtcTVL = wbtcCollateralBalance + wbtcStableBalance;

    const pools = [
        {
            pool: `${usdcWethVault.poolAddress}-base`,
            chain: 'Base',
            project: 'mortgagefi',
            symbol: 'USDC',
            tvlUsd: wethTVL,
            apy: baseApys.output[1].output / 100,
        },
        {
            pool: `${usdcCbBtcVault.poolAddress}-base`,
            chain: 'Base',
            project: 'mortgagefi',
            symbol: 'USDC',
            tvlUsd: cbBtcTVL,
            apy: baseApys.output[0].output / 100,
        },
        {
            pool: `${usdtWbtcVault.poolAddress}-arbitrum`,
            chain: 'Arbitrum',
            project: 'mortgagefi',
            symbol: 'USDT',
            tvlUsd: wbtcTVL,
            apy: arbitrumApys.output[0].output / 100,
        }
    ]
    return pools
}

module.exports = {
    timetravel: false,
    apy: apy,
    url: 'https://mortgagefi.app/markets',
}
