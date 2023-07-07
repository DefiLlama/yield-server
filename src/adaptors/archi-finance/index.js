const utils = require('../utils');
const sdk = require('@defillama/sdk');
const axios = require('axios');

const STAKING_API = 'https://price.archi.finance/api/apr';
const addresses = {
    tokens:{
        weth:"0x82af49447d8a07e3bd95bd0d56f35241523fbab1",
        usdc:"0xff970a61a04b1ca14834a43f5de4533ebddb5cc8",
        usdt:"0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9",
        wbtc:"0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f",
        archi:"0x93D504070AB0eede5449C89C5eA0F5e34D8103f8",
    },
    reward: {
        // weth pool
        weth:"0x9eBC025393d86f211A720b95650dff133b270684",
        // usdt pool
        usdt:"0xEca975BeEc3bC90C424FF101605ECBCef22b66eA",
        // usdc pool
        usdc:"0x670c4391f6421e4cE64D108F810C56479ADFE4B3",
        // wbtc pool
        wbtc:"0x12e14fDc843Fb9c64B84Dfa6fB03350D6810d8e5",
        //archi pool
        archi:"0xf4c36D458e2D96497E5EEf7C3a01FcD727422f7b",
    }
}

const apy = async () => {
    const  tvlweth  = await tvlWETH();
    const  tvlusdc  = await tvlUSDC();
    const  tvlusdt  = await tvlUSDT();
    const  tvlwbtc  = await tvlWBTC();
    const  tvlarchi  = await tvlARCHI();
    const resAPR = await utils.getData(STAKING_API);


    const stakingPools = resAPR.data.apr.map(pool => {

        if (pool.symbol == "WETH") {
            pool.tvlUsd = tvlweth
        }
        if (pool.symbol == "USDC") {
            pool.tvlUsd = tvlusdc
        }
        if (pool.symbol == "USDT") {
            pool.tvlUsd = tvlusdt
        }
        if (pool.symbol == "WBTC") {
            pool.tvlUsd = tvlwbtc
        }
        if (pool.symbol == "ARCHI") {
            pool.tvlUsd = tvlarchi
        }

        return pool
        });

    return stakingPools;
}


async function tvlWETH() {
    const totalSupply = await sdk.api.abi.call({
        abi: 'erc20:totalSupply',
        target: addresses.reward.weth,
        params: [],
        chain: 'arbitrum',
    });
    const key = `arbitrum:${addresses.tokens.weth}`;
    let priceUsd = await axios.get(
        `https://coins.llama.fi/prices/current/${key}`
    );

    priceUsd = priceUsd.data.coins[key].price;
    let tvl = (Number(totalSupply.output) / 1e18) * priceUsd;

    return tvl;
}
async function tvlUSDC() {
    const totalSupply = await sdk.api.abi.call({
        abi: 'erc20:totalSupply',
        target: addresses.reward.usdc,
        params: [],
        chain: 'arbitrum',
    });
    const key = `arbitrum:${addresses.tokens.usdc}`;
    let priceUsd = await axios.get(
        `https://coins.llama.fi/prices/current/${key}`
    );

    priceUsd = priceUsd.data.coins[key].price;
    let tvl = (Number(totalSupply.output) / 1e6) * priceUsd;

    return tvl;
}
async function tvlUSDT() {
    const totalSupply = await sdk.api.abi.call({
        abi: 'erc20:totalSupply',
        target: addresses.reward.usdt,
        params: [],
        chain: 'arbitrum',
    });
    const key = `arbitrum:${addresses.tokens.usdt}`;
    let priceUsd = await axios.get(
        `https://coins.llama.fi/prices/current/${key}`
    );

    priceUsd = priceUsd.data.coins[key].price;
    let tvl = (Number(totalSupply.output) / 1e6) * priceUsd;

    return tvl;
}

async function tvlWBTC() {
    const totalSupply = await sdk.api.abi.call({
        abi: 'erc20:totalSupply',
        target: addresses.reward.wbtc,
        params: [],
        chain: 'arbitrum',
    });
    const key = `arbitrum:${addresses.tokens.wbtc}`;
    let priceUsd = await axios.get(
        `https://coins.llama.fi/prices/current/${key}`
    );

    priceUsd = priceUsd.data.coins[key].price;
    let tvl = (Number(totalSupply.output) / 1e8) * priceUsd;

    return tvl;
}

async function tvlARCHI() {
    const totalSupply = await sdk.api.abi.call({
        abi: 'erc20:totalSupply',
        target: addresses.reward.archi,
        params: [],
        chain: 'arbitrum',
    });
    const key = `arbitrum:${addresses.tokens.archi}`;
    let priceUsd = await axios.get(
        `https://coins.llama.fi/prices/current/${key}`
    );

    priceUsd = priceUsd.data.coins[key].price;
    let tvl = (Number(totalSupply.output) / 1e18) * priceUsd;

    return tvl;
}

module.exports = {
    apy,
    timetravel: false,
    url: 'https://app.archi.finance/passive',
};