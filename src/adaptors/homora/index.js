const axios = require("axios");
const utils = require('../utils');
const sdk = require('@defillama/sdk');
const abi = require('./abi.json');
const { unwrapUniswapLPs } = require("../helper/unwrapLPs");
const { default: computeTVL } = require("@defillama/sdk/build/computeTVL");
const chains = {
    1: "Ethereum",
    250: "Fantom",
    43114: "Avalanche"
};

async function chefSymbols(poolInfos, chainId) {
    const [
        { output: token0s },
        { output: token1s }
    ] = await Promise.all([
        sdk.api.abi.multiCall({
            abi: abi.token0,
            calls: poolInfos.map(p => ({
                target: p.output.lpToken,
            })),
            chain: chains[chainId].toLowerCase()
        }),
        sdk.api.abi.multiCall({
            abi: abi.token1,
            calls: poolInfos.map(p => ({
                target: p.output.lpToken,
            })),
            chain: chains[chainId].toLowerCase()
        })
    ]);

    const [
        { output: token0Symbols },
        { output: token1Symbols }
    ] = await Promise.all([
        sdk.api.abi.multiCall({
            abi: 'erc20:symbol',
            calls: token0s.map(t => ({
                target: t.output,
            })),
            chain: chains[chainId].toLowerCase()
        }),
        sdk.api.abi.multiCall({
            abi: 'erc20:symbol',
            calls: token1s.map(t => ({
                target: t.output,
            })),
            chain: chains[chainId].toLowerCase()
        }),
    ]);

    return token0Symbols.map((t, i) =>
        `${t.output}-${token1Symbols[i].output}`
    );
};
async function chefTvls(poolInfos, apys, chefs, chainId) {
    const balance = (await sdk.api.abi.multiCall({
        abi: abi.userInfo,
        calls: Object.keys(apys).map((p, i) => ({
            target: chefs[i].output,
            params: [
                p.substring(p.lastIndexOf('-') + 1),
                p.substring(p.indexOf('-') + 1, p.lastIndexOf('-'))
            ]
        })),
        chain: chains[chainId].toLowerCase()
    })).output;

    const tvls = [];

    for (let i = 0; i < balance.length; i++) {
        const balances = {};
        await unwrapUniswapLPs(
            balances,
            [{
                balance: balance[i].output.amount,
                token: poolInfos[i].output.lpToken
            }]
        );
        tvls.push((await computeTVL(balances, "now", false, [], getCoingeckoLock, 5)).usdTvl);
    };

    return tvls;
};
async function chefs(apys, chainId) {
    const chefs = (await sdk.api.abi.multiCall({
        abi: abi.chef,
        calls: Object.keys(apys).map(p => ({
            target: p.substring(p.indexOf('-') + 1, p.lastIndexOf('-')),
        })),
        chain: chains[chainId].toLowerCase()
    })).output;

    const poolInfos = (await sdk.api.abi.multiCall({
        abi: abi.poolInfo,
        calls: Object.keys(apys).map((p, i) => ({
            target: chefs[i].output,
            params: [p.substring(p.lastIndexOf('-') + 1)]
        })),
        chain: chains[chainId].toLowerCase()
    })).output;

    const [symbols, tvls] = await Promise.all([
        chefSymbols(poolInfos, chainId),
        chefTvls(poolInfos, apys, chefs, chainId)
    ]);

    return Object.entries(apys).map(([k, v], i) => ({
        pool: `${k}`,
        chain: chains[chainId],
        project: 'homora',
        symbol: symbols[i],
        tvlUsd: tvls[i],
        apy: Number(v.totalAPY)
    }));
};
async function apy(chainId) {
    const apys = (await axios.get(`https://api.homora.alphaventuredao.io/v2/${chainId}/apys`)).data;

    //const wchefs = Object.fromEntries(Object.entries(apys).filter(([key]) => key.includes('wchef')));
    const werc20s = Object.fromEntries(Object.entries(apys).filter(([key]) => key.includes('werc20')));
    //const a = await chefs(wchefs, chainId);
    const b = await erc20s(werc20s, chainId)
    console.log('a')
}; // node src/adaptors/test.js src/adaptors/homora/index.js
const main = async () => {
    return await apy(1);
};
function getCoingeckoLock() {
    return new Promise((resolve) => {
        locks.push(resolve);
    });
};

module.exports = {
    timetravel: false,
    apy: main,
};