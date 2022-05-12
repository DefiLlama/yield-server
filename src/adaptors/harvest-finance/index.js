const axios = require("axios");
const utils = require('../utils');
const farmsUrl = 'https://api-ui.harvest.finance/vaults?key=41e90ced-d559-4433-b390-af424fdc76d6';
const poolsUrl = 'https://api-ui.harvest.finance/pools?key=41e90ced-d559-4433-b390-af424fdc76d6';
const chains = {
    "bsc": "binance",
    "eth": "ethereum",
    "matic": "polygon"
};

function aggregateApys(farm, poolsResponse) {
    const farmApy = farm.estimatedApy;
    const selectedPools = poolsResponse.filter(p => p.contractAddress == farm.rewardPool);
    if (selectedPools.length == 0) return farmApy;
    const pool = selectedPools[0];
    const poolApy = Number(pool.tradingApy) + pool.rewardAPY
        .reduce((a,b) => Number(a) + Number(b), 0);
    return Number(farmApy) + Number(poolApy);
};

async function apy() {
    const farmsResponse = (await axios.get(farmsUrl)).data;
    const poolsResponse = (await axios.get(poolsUrl)).data;

    let allVaults = [];

    for (let chain of Object.keys(chains)) {
        const activeFarms = Object.values(farmsResponse[chain])
            .filter(v => !v.hasOwnProperty('inactive') || v.inactive != true);

        const farms = activeFarms.map(v => ({
            pool: v.vaultAddress,
            chain: utils.formatChain(chains[chain]),
            project: 'harvest-finance',
            symbol: utils.formatSymbol(v.displayName),
            tvlUsd: Number(v.totalValueLocked),
            apy: aggregateApys(v, poolsResponse[chain])
        }));

        allVaults = [...allVaults, ...farms];
    };

    return allVaults;
};

const main = async () => {
    return await apy();
};

module.exports = {
    timetravel: false,
    apy: main,
};