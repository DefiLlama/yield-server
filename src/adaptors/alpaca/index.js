const axios = require("axios");
const utils = require('../utils');

async function apy(chain) {
    const response = (await axios.get(`https://alpaca-static-api.alpacafinance.org/${chain}/v1/landing/summary.json`)).data.data;

    const filteredStakingPools = response.fairLaunchStakingPools.filter(p => !p.key.includes('debt'))
    const fairLaunchStakingPools = filteredStakingPools.map(p => ({
        pool: `${p.key}-staking`,
        chain: chain == 'bsc' ? 'Binance' : utils.formatChain(chain),
        project: 'alpaca',
        symbol: utils.formatSymbol(p.sourceName),
        tvlUsd: p.tvl,
        apy: p.apy
    }));

    const farmingPools = response.farmingPools.map(p => ({
        pool: `${p.key}-farming-pool`,
        chain: chain == 'bsc' ? 'Binance' : utils.formatChain(chain),
        project: 'alpaca',
        symbol: utils.formatSymbol(p.sourceName),
        tvlUsd: p.tvl,
        apy: p.totalApy
    }));

    const ausdPools = response.ausdPools.map(p => ({
        pool: `${p.key}-aUSD-pool`,
        chain: chain == 'bsc' ? 'Binance' : utils.formatChain(chain),
        project: 'alpaca',
        symbol: utils.formatSymbol(p.sourceName),
        tvlUsd: p.tvl,
        apy: p.totalApy
    }));

    const lendingPools = response.lendingPools.map(p => ({
        pool: p.ibToken.address,
        chain: chain == 'bsc' ? 'Binance' : utils.formatChain(chain),
        project: 'alpaca',
        symbol: utils.formatSymbol(p.symbol),
        tvlUsd: p.tvl,
        apy: p.totalApy
    }));

    return [
        ...fairLaunchStakingPools,
        ...farmingPools,
        ...ausdPools,
        ...lendingPools
    ];
};

const main = async () => {
    const [bsc, ftm] = await Promise.all([
        apy('bsc'),
        apy('ftm')
    ]);
    return [...bsc, ...ftm];
};

module.exports = {
    timetravel: false,
    apy: main,
};