const axios = require("axios");
const utils = require('../utils');

async function grasshouseTvl(vault) {
    return vault
}
async function apy(chain) {
    const response = (await axios.get(`https://alpaca-static-api.alpacafinance.org/${chain}/v1/landing/summary.json`)).data.data;

    // how to get grasshouse Tvl??
    // const grasshousePools = response.grasshousePools.map(p => ({
    //     pool: p.address,
    //     chain: utils.formatChain(chain),
    //     project: 'alpaca',
    //     symbol: utils.formatSymbol(s.key),
    //     tvlUsd: (grasshouseTvl(s.address)),
    //     apy: p.apy
    // }))
    const fairLaunchStakingPools = response.fairLaunchStakingPools.map(p => ({
        pool: `${p.key}-fair-launch`,
        chain: utils.formatChain(chain),
        project: 'alpaca',
        symbol: utils.formatSymbol(p.sourceName),
        tvlUsd: p.tvl,
        apy: p.apy
    }))
    const farmingPools = response.farmingPools.map(p => ({
        pool: `${p.key}-farming-pool`,
        chain: utils.formatChain(chain),
        project: 'alpaca',
        symbol: utils.formatSymbol(p.sourceName),
        tvlUsd: p.tvl,
        apy: p.totalApy
    }))
    const ausdPools = response.ausdPools.map(p => ({
        pool: `${p.key}-aUSD-pool`,
        chain: utils.formatChain(chain),
        project: 'alpaca',
        symbol: utils.formatSymbol(p.sourceName),
        tvlUsd: p.tvl,
        apy: p.totalApy
    }))
    const strategyPools = response.strategyPools.map(p => ({
        pool: p.iuToken.address,
        chain: utils.formatChain(chain),
        project: 'alpaca',
        symbol: utils.formatSymbol(p.key),
        tvlUsd: p.tvl,
        apy: p.apy
    }))
    const lendingPools = response.lendingPools.map(p => ({
        pool: p.ibToken.address,
        chain: utils.formatChain(chain),
        project: 'alpaca',
        symbol: utils.formatSymbol(p.symbol),
        tvlUsd: p.tvl,
        apy: p.totalApy
    }))

    return [
        ...fairLaunchStakingPools, 
        ...farmingPools, 
        ...ausdPools, 
        ...strategyPools, 
        ...lendingPools
    ];
};

const main = async () => {
    const [ bsc, ftm ] = await Promise.all([
        apy('bsc'),
        apy('ftm')
    ])
    return [...bsc, ...ftm];
};
module.exports = {
    timetravel: false,
    apy: main,
};