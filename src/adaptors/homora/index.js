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
const LP_SYMBOLS = ['SLP', 'spLP', 'JLP', 'OLP', 'SCLP', 'DLP', 'MLP', 'MSLP', 'ULP', 'TLP', 'HMDX', 'YLP', 'SCNRLP', 'PGL', 'GREEN-V2', 'PNDA-V2'];

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
async function lpSymbols(address, chainId) {
    const [
        { output: token0 },
        { output: token1 }
    ] = await Promise.all([
        sdk.api.abi.call({
            abi: abi.token0,
            target: address,
            chain: chains[chainId].toLowerCase()
        }),
        sdk.api.abi.call({
            abi: abi.token1,
            target: address,
            chain: chains[chainId].toLowerCase()
        })
    ]);

    const [
        { output: token0Symbol },
        { output: token1Symbol }
    ] = await Promise.all([
        sdk.api.abi.call({
            abi: 'erc20:symbol',
            target: token0,
            chain: chains[chainId].toLowerCase()
        }),
        sdk.api.abi.call({
            abi: 'erc20:symbol',
            target: token1,
            chain: chains[chainId].toLowerCase()
        }),
    ]);

    return `${token0Symbol}-${token1Symbol}`;
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
async function staking(apys, chainId) {
    const stakingTokens = (await sdk.api.abi.multiCall({
        abi: abi.underlying,
        calls: Object.keys(apys).map(p => ({
            target: p.substring(p.indexOf('-') + 1)
        })),
        chain: chains[chainId].toLowerCase()
    })).output;

    const symbols = (await sdk.api.abi.multiCall({
        abi: 'erc20:symbol',
        calls: stakingTokens.map(t => ({
            target: t.output,
        })),
        chain: chains[chainId].toLowerCase()
    })).output

    const balance = (await sdk.api.abi.multiCall({
        abi: 'erc20:balanceOf',
        calls: Object.keys(apys).map((p, i) => ({
            target: stakingTokens[i].output,
            params: [ p.substring(p.indexOf('-') + 1) ]
        })),
        chain: chains[chainId].toLowerCase()
    })).output;

    let a = [];
    for (let i = 0; i < Object.keys(apys).length; i++) {
        let symbol;
        const balances = {};
        if (LP_SYMBOLS.includes(symbols[i].output) || /(UNI-V2)/.test(symbols[i].output) || symbols[i].output.split(/\W+/).includes('LP')) {
            symbol = await lpSymbols(stakingTokens[i].output, chainId)
            await unwrapUniswapLPs(balances, [{ token: stakingTokens[i].output, balance: balance[i].output }])
        } else {
            symbol = symbols[i]
            sdk.util.sumSingleBalance(balances, stakingTokens[i].output, balance[i].output)
        }
        a.push({
            pool: Object.keys(apys)[i],
            chain: chains[chainId],
            project: 'homora',
            symbol,
            tvlUsd: (await computeTVL(balances, "now", false, [], getCoingeckoLock, 5)).usdTvl, ///
            apy: Number(Object.values(apys)[i].totalAPY)
        })
    }
    return a;
};
function sortByKey(apys, key) {
    return Object.fromEntries(Object.entries(apys).filter(([k]) => k.includes(key)));
};
async function apy(chainId) {
    const apys = (await axios.get(`https://api.homora.alphaventuredao.io/v2/${chainId}/apys`)).data;

    return [
        // ...(await chefs(sortByKey(apys, 'wchef'), chainId)),
        // ...(await erc20s(sortByKey(apys, 'werc20'), chainId)),
        // ...(await gauge(sortByKey(apys, 'wgauge'), chainId)),
        ...(await staking(sortByKey(apys, 'wstaking'), chainId))
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