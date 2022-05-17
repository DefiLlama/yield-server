const axios = require("axios");
const utils = require('../utils');
const sdk = require('@defillama/sdk');
const abi = require('./abi.json');
const { unwrapUniswapLPs, genericUnwrapCrv } = require("../helper/unwrapLPs");
const { default: computeTVL } = require("@defillama/sdk/build/computeTVL");
const chains = {
    1: "Ethereum",
    250: "Fantom",
    43114: "Avalanche"
};
const crv3 = '0x6c3f90f043a72fa612cbac8115ee7e52bde6e490';
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
async function erc20Symbols(tokens, chainId) {
    const [
        { output: token0s },
        { output: token1s }
    ] = await Promise.all([
        sdk.api.abi.multiCall({
            abi: abi.token0,
            calls: tokens.map(p => ({
                target: p.output,
            })),
            chain: chains[chainId].toLowerCase()
        }),
        sdk.api.abi.multiCall({
            abi: abi.token1,
            calls: tokens.map(p => ({
                target: p.output,
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
async function erc20Tvls(apys, tokens, chainId) {
    const balance = (await sdk.api.abi.multiCall({
        abi: 'erc20:balanceOf',
        calls: Object.keys(apys).map((p, i) => ({
            target: tokens[i].output,
            params: [
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
                balance: balance[i].output,
                token: tokens[i].output
            }]
        );
        tvls.push((await computeTVL(balances, "now", false, [], getCoingeckoLock, 5)).usdTvl);
    };

    return tvls;
};
async function erc20s(apys, chainId) {
    const tokens = (await sdk.api.abi.multiCall({
        abi: abi.getUnderlyingToken,
        calls: Object.keys(apys).map(p => ({
            target: p.substring(p.indexOf('-') + 1, p.lastIndexOf('-')),
            params: p.substring(p.lastIndexOf('-') + 1)
        })),
        chain: chains[chainId].toLowerCase()
    })).output;

    const [symbols, tvls] = await Promise.all([
        erc20Symbols(tokens, chainId),
        erc20Tvls(apys, tokens, chainId)
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
async function gauge(apys, chainId) {
    let p = Object.keys(apys)[0]
    let a = p.substring(p.indexOf('-') + 1, p.lastIndexOf('-') - 2)
    let b = p.substring(p.lastIndexOf('-') + 1)
    const tokens = (await sdk.api.abi.multiCall({
        abi: abi.getUnderlyingToken,
        calls: Object.keys(apys).map(p => ({
            target: p.substring(p.indexOf('-') + 1, p.lastIndexOf('-') - 2),
            params: p.substring(p.lastIndexOf('-') + 1)
        })),
        chain: chains[chainId].toLowerCase()
    })).output;

    const [{ output: symbols }, tvls] = await Promise.all([
        sdk.api.abi.multiCall({
            abi: 'erc20:symbol',
            calls: tokens.map(t => ({
                target: t.output,
            })),
            chain: chains[chainId].toLowerCase()
        }),
        gaugeTvls(apys, tokens, chainId)
    ]);

    return Object.entries(apys).map(([k, v], i) => ({
        pool: `${k}`,
        chain: chains[chainId],
        project: 'homora',
        symbol: symbols[i].output,
        tvlUsd: tvls[i],
        apy: Number(v.totalAPY)
    }));
};
async function gaugeTvls(apys, tokens, chainId) {
    const gauges = (await sdk.api.abi.multiCall({
        abi: abi.gauges,
        calls: Object.keys(apys).map((p, i) => ({
            target: p.substring(p.indexOf('-') + 1, p.lastIndexOf('-') - 2),
            params: [
                p.substring(p.lastIndexOf('-') - 1, p.lastIndexOf('-')),
                p.substring(p.lastIndexOf('-') + 1)
            ]
        })),
        chain: chains[chainId].toLowerCase()
    })).output;

    const balance = (await sdk.api.abi.multiCall({
        abi: 'erc20:balanceOf',
        calls: Object.keys(apys).map((p, i) => ({
            target: gauges[i].output.impl,
            params: [
                p.substring(p.indexOf('-') + 1, p.lastIndexOf('-') - 2)
            ]
        })),
        chain: chains[chainId].toLowerCase()
    })).output;

    const tvls = [];

    for (let i = 0; i < balance.length; i++) {
        const balances = {};
        if (tokens[i].output.toLowerCase() == crv3) {
            sdk.util.sumSingleBalance(balances, crv3, balance[i].output)
        } else {
            await genericUnwrapCrv(balances, tokens[i].output, balance[i].output, undefined, chains[chainId].toLowerCase())
        }
        tvls.push((await computeTVL(balances, "now", false, [], getCoingeckoLock, 5)).usdTvl);
    };

    return tvls;
};
function sortByKey(apys, key) {
    return Object.fromEntries(Object.entries(apys).filter(([k]) => k.includes(key)));
};
async function apy(chainId) {
    const apys = (await axios.get(`https://api.homora.alphaventuredao.io/v2/${chainId}/apys`)).data;

    return [
        ...(await chefs(sortByKey(apys, 'wchef'), chainId)),
        ...(await erc20s(sortByKey(apys, 'werc20'), chainId)),
        ...(await gauge(sortByKey(apys, 'wgauge'), chainId))
    ];
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