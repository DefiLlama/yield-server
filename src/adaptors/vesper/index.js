const axios = require("axios");
const utils = require('../utils');
const urls = {
    "polygon": "https://api-polygon.vesper.finance/pools?stages=prod",
    "ethereum": "https://api.vesper.finance/pools?stages=prod",
    "avalanche": "https://api-avalanche.vesper.finance/pools?stages=prod"
};

async function apy(chain) {
    const response = (await axios.get(urls[chain])).data;

    const farms = response.map(v => ({
        pool: `${v.address}`,
        chain: utils.formatChain(chain),
        project: 'vesper',
        symbol: utils.formatSymbol(v.asset.symbol),
        tvlUsd: v.totalValue / 1e18 ,
        apy: aggregateApys(v)
    }));

    return farms;
};

function aggregateApys(pool) {
    const earningRate = pool.earningRates[3];
    const rewardRate = pool.poolTokenRewardRates.reduce(
        (a, r) => Number(r.tokenDeltaRates[3]) + Number(a), 0);
    return earningRate + rewardRate;
};

const main = async () => {
    const [p, e, a] = await Promise.all([
        apy("polygon"),
        apy("ethereum"),
        apy("avalanche")
    ]);

    return [...p, ...e, ...a];
};

module.exports = {
    timetravel: false,
    apy: main,
};