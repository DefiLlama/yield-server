const axios = require("axios");
const utils = require('../utils');
const url = 'https://api.vesper.finance/pools?stages=prod';
const chains = {
    137: "polygon",
    1: "ethereum",
    43114: "avalanche"
};
// node src/adaptors/test.js src/adaptors/vesper/index.js
async function apy() {
    const response = (await axios.get(url)).data;

    const farms = response.map(v => ({
        pool: `${v.address}`,
        chain: utils.formatChain(chains[v.chainId]),
        project: 'vesper',
        symbol: utils.formatSymbol(v.asset.symbol),
        tvlUsd: v.earningRates[1] ,
        apy: aggregateApys(v)
    }));

    return farms;
};
function aggregateApys(pool) {
    const earningRate = pool.earningRates[1]
    const rewardRate = pool.poolTokenRewardRates.reduce(
        (a, r) => Number(r.tokenDeltaRates[1]) + Number(a), 0)
    return earningRate + rewardRate
}

const main = async () => {
    return await apy();
};
module.exports = {
    timetravel: false,
    apy: main,
};