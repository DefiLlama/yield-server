const { symbol } = require('../impermax-finance/abi');
const { REWARD_TOKEN } = require('../line-token-rewards/config');
const utils = require('../utils')

const SY_pool = async() => {

    console.log("running")
    const TVL = Number(await utils.getData('https://api.llama.fi/tvl/sensi'))
    const APY = await utils.getData("https://sensi-autotask-rebalance.sensible-finance.workers.dev/syAPR")

    const SY_pool_metrics = {
        pool: '0x21B656d3818A1dD07B800c1FE728fB81921af3A3',
        chain: utils.formatChain('bnb'),
        project: 'sensi',
        symbol: 'BNB (Smart Yield)',
        tvlUsd: TVL,
        apy: APY,
        poolMeta: "Smart Yield is an automated Yield farm, that does all the work of managing yield farming automatically",
    }

    return [SY_pool_metrics]
}

module.exports = {
    timetravel: false,
    apy: SY_pool,
    url: "https://app.sensi.fi/",
}
