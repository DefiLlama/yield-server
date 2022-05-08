const axios = require("axios");
const pfcore = "https://api.pickle.finance/prod/protocol/pfcore/";

async function apy() {
    const response = (await axios.get(pfcore))?.data.assets;
    const strategies = Object.values(response);
    const current = strategies[0].filter(
        s => s.enablement == 'enabled' 
        && s.details.harvestStats != undefined
        );

    return current.map(s => ({
        pool: s.contract,
        chain: s.chain == 'eth' ? 'ethereum' : s.chain,
        project: 'pickle',
        symbol: s.depositToken.name,
        tvlUsd: s.details.harvestStats.balanceUSD,
        apy: aggregateApys(s)
    }));
};
function aggregateApys(strategy) {
    let apy = 0;
    if (strategy.hasOwnProperty('aprStats')) {
        apy += strategy.aprStats.apy;
    };
    if (strategy.hasOwnProperty('farm') 
        && strategy.farm.details.farmApyComponents != undefined) {
        apy += strategy.farm.details.farmApyComponents
            .reduce((a, b) => Number(a) + Number(b.apr), 0)
    };
    return apy;
};
const main = async () => {
    const data = await apy();
    return data;
};
module.exports = {
    timetravel: false,
    apy: main,
};
