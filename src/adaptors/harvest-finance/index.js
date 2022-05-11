const axios = require("axios");
const utils = require('../utils');
const farmsUrl = 'https://api-ui.harvest.finance/vaults?key=41e90ced-d559-4433-b390-af424fdc76d6';
const poolsUrl = 'https://api-ui.harvest.finance/pools?key=41e90ced-d559-4433-b390-af424fdc76d6';
const chains = {
    "bsc": "binance",
    "eth": "ethereum",
    "matic": "polygon"
};

async function apy() {
    const farmsResponse = (await axios.get(farmsUrl)).data;
    const poolsResponse = (await axios.get(poolsUrl)).data;

    let allVaults = [];

    for (let chain of Object.keys(chains)) {
        const activeFarms = Object.values(farmsResponse[chain])
            .filter(v => v.inactive != true);

        const farms = activeFarms.map(v => ({
            pool: `${v.vaultAddress}-${v.id}`,
            chain: utils.formatChain(chains[chain]),
            project: 'harvest-finance',
            symbol: utils.formatSymbol(v.displayName),
            tvlUsd: Number(v.totalValueLocked),
            apy: Number(v.estimatedApy)
        }));

        const pools = poolsResponse[chain].map(p => ({
            pool: `${p.contractAddress}-${p.id}`,
            chain: utils.formatChain(chains[chain]),
            project: 'harvest',
            symbol: utils.formatSymbol(p.lpTokenData.symbol),
            tvlUsd: Number(p.totalValueLocked),
            apy: Number(p.tradingApy) + p.rewardAPY
                .reduce((a,b) => Number(a) + Number(b), 0)
        }));

        allVaults = [...allVaults, ...farms, ...pools];
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