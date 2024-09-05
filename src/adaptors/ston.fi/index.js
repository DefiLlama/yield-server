const utils = require('../utils');

// ignore pools with TVL below the threshold
const MIN_TVL_USD = 100000;

const getApy = async () => {
    console.log("Requesting pools list")
    const pool_list = (await utils.getData('https://api.ston.fi/v1/pools')).pool_list;
    console.log("Requesting farms list")
    const farm_list = (await utils.getData('https://api.ston.fi/v1/farms')).farm_list;
    console.log("Requesting assets list")
    const asset_list = (await utils.getData('https://api.ston.fi/v1/assets')).asset_list;
    console.log("Well done, preparing output list")
    const asset2symbol = {};
    for (const asset of asset_list) {
        if (asset.community || asset.blacklisted) {
            continue;
        }
        asset2symbol[asset.contract_address] = asset.symbol;
    }
    const pool2tvl = {};
    for (const pool of pool_list) {
        // ignore pools with low liquidity
        if (pool['lp_total_supply_usd'] < MIN_TVL_USD) {
            continue
        }
        pool2tvl[pool['address']] = {
            tvl: pool['lp_total_supply_usd'],
            tokens: [pool['token0_address'], pool['token1_address']],
            base_apy: pool['apy_1d']
        }
    }

    const pools = Object.keys(pool2tvl)
        .map((pool_address) => {
            const farm = farm_list.find((f) => f.pool_address == pool_address && f.status == 'operational')
            const pool_info = pool2tvl[pool_address];
            if (!(pool_info.tokens[0] in asset2symbol && pool_info.tokens[1] in asset2symbol)) {
                console.error("Can't find symbol", pool_info);
                return null;
            }
            const s1 = asset2symbol[pool_info.tokens[0]]
            const s2 = asset2symbol[pool_info.tokens[1]];
            // use apropriate base-quote order
            let symbol = '';
            if (s1 == 'USD₮') {
                symbol = `${s2}-${s1}`
            } else if (s2 == 'USD₮') {
                symbol = `${s1}-${s2}`
            } else if (s1 == 'TON') {
                symbol = `${s2}-${s1}`
            } else {
                symbol = `${s1}-${s2}`
            }

            return {
                pool: `${pool_address}-ton`.toLowerCase(),
                chain: 'Ton',
                project: 'ston.fi',
                symbol: symbol,
                tvlUsd: Number(pool_info.tvl),
                apyBase: Number(pool_info.base_apy) * 100,
                apyReward: farm ? Number(farm.apy) * 100 : 0,
                rewardTokens: farm ? [farm.reward_token_address] : undefined,
                underlyingTokens: pool_info.tokens,
                url: `https://app.ston.fi/pools/${pool_address}`
            };
        }).filter((pool) => pool != null);
    return pools;
};

module.exports = {
    timetravel: false,
    apy: getApy,
    url: 'https://ston.fi/',
};
