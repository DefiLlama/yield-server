const utils = require('../utils');

// ignore pools with TVL below the threshold
const MIN_TVL_USD = 100000;
// LPs get 80% of fees
const FEES_PERCENT_TO_LP = 0.8;
const GRAPHQL_ENDPOINT = 'https://api.dedust.io/v3/graphql';
const BOOSTS_QUERY = `
query GetBoosts {
    boosts {
      asset
      budget
      endAt
      liquidityPool
      rewardPerDay
      startAt
    }
  }
`;

const POOLS_QUERY = `
query GetPools($filter: PoolsFiltersInput) {
    pools(filter: $filter) {
      address
      totalSupply
      type
      tradeFee
      assets
      reserves
      fees
      volume
    }
  }
  
`;

const ASSETS_QUERY = `
query GetAssets {
    assets {
      type
      address
      name
      symbol
      image
      decimals
      aliased
      price
      source {
        chain
        address
        bridge
        symbol
        name
      }
    }
  }
  
`;

const formatAddress = (addr) => {
    if (addr == 'native') {
        return '0x0000000000000000000000000000000000000000';
    } else if (addr.startsWith('jetton:')) {
        return addr.slice(7);
    } else {
        return addr;
    }
}

const getApy = async () => {
    // console.log("Requesting pools list")
    // const pool_list = (await utils.getData('https://api.ston.fi/v1/pools')).pool_list;
    console.log("Requesting assets list")
    const assetsList = (await utils.getData(GRAPHQL_ENDPOINT, {
        query: ASSETS_QUERY,
        operationName: 'GetAssets'
    })).data.assets;

    const assetInfo = {};
    for (const asset of assetsList) {
        const address = asset.type == 'native' ? 'native' : 'jetton:' + asset.address;
        assetInfo[address] = {
            decimals: asset.decimals,
            price: Number(asset.price),
            symbol: asset.symbol
        }
    }
    console.log(`Inited ${Object.keys(assetInfo).length} assets`);

    console.log("Requesting pools list")
    const poolsList = (await utils.getData(GRAPHQL_ENDPOINT, {
        query: POOLS_QUERY,
        operationName: 'GetPools'
    })).data.pools;

    const poolsInfo = {};
    for (const pool of poolsList) {
        const address = pool.address;
        const leftAddr = pool.assets[0];
        const rightAddr = pool.assets[1];
        if (!(leftAddr in assetInfo && rightAddr in assetInfo)) {
            console.warn("No assets info for pool", pool);
            continue;
        }
        const left = assetInfo[leftAddr];
        const right = assetInfo[rightAddr];

        const tvl = left.price * Number(pool.reserves[0]) / Math.pow(10, left.decimals)
            + right.price * Number(pool.reserves[1]) / Math.pow(10, right.decimals);
        if (tvl < MIN_TVL_USD) {
            continue
        }

        // use apropriate base-quote order
        let symbol = '';
        if (left.symbol == 'USDT') {
            symbol = `${right.symbol}-${left.symbol}`
        } else if (right.symbol == 'USDT') {
            symbol = `${left.symbol}-${right.symbol}`
        } else if (left.symbol == 'TON') {
            symbol = `${right.symbol}-${left.symbol}`
        } else {
            symbol = `${left.symbol}-${right.symbol}`
        }

        // estimate daily feees based on the token prices
        const feesDaily = (left.price * Number(pool.fees[0]) / Math.pow(10, left.decimals)
            + right.price * Number(pool.fees[1]) / Math.pow(10, right.decimals)) / 2;

        // FEES_PERCENT_TO_LP is a share of fees to LP, so estimate APY based on in
        const apyBase = Math.pow((1 + FEES_PERCENT_TO_LP * feesDaily / tvl), 365) - 1;

        poolsInfo[pool.address] = {
            symbol: symbol,
            tvl: tvl,
            apyBase: apyBase,
            underlyingTokens: [formatAddress(leftAddr), formatAddress(rightAddr)]
        }
    }
    console.log(`Inited ${Object.keys(poolsInfo).length} pools`);

    console.log("Requesting boosts list");
    const boostsList = (await utils.getData(GRAPHQL_ENDPOINT, {
        query: BOOSTS_QUERY,
        operationName: 'GetBoosts'
    })).data.boosts;

    // rewards in USD per pool for each token
    const rewardsPerPool = {};
    for (const boost of boostsList) {
        // console.log(boost)
        if (!(boost.asset in assetInfo)) {
            console.warn("Boosted asset not in assets list", boost);
            continue;
        }
        const asset = assetInfo[boost.asset];
        // estimate daily rewards in USD
        const rewardDaily = asset.price * Number(boost.rewardPerDay) / Math.pow(10, asset.decimals);
        if (!(boost.liquidityPool in rewardsPerPool)) {
            rewardsPerPool[boost.liquidityPool] = {}
        }
        if (!(boost.asset in rewardsPerPool[boost.liquidityPool])) {
            rewardsPerPool[boost.liquidityPool][boost.asset] = 0;
        }
        rewardsPerPool[boost.liquidityPool][boost.asset] += rewardDaily;
    }

    // boosted APY dictionary, includes reward APY(actually it is APR) and rewards tokens
    const boostedApy = [];

    for (const address in rewardsPerPool) {
        if (!(address in poolsInfo)) {
            console.warn("No pool data for boosted pool", address);
            continue;
        }

        const pool = rewardsPerPool[address];
        // console.log(pool)
        let totalRewards = 0;
        let rewardTokens = [];
        for (const reward of Object.values(pool)) {
            totalRewards += reward;
        }

        // filter out tokens without significant impact
        for (const token of Object.keys(pool)) {
            const impact = pool[token];
            if (impact > totalRewards * 0.2) {
                rewardTokens.push(formatAddress(token))
            }
        }
        // using APR formula because it is not auto-compounding
        const apyReward = 365 * totalRewards / poolsInfo[address].tvl;
        boostedApy.push({
            tvl: poolsInfo[address].tvl,
            apyReward: 100 * apyReward,
            apyBase: 100 * poolsInfo[address].apyBase,
            symbol: poolsInfo[address].symbol,
            address: address,
            underlyingTokens: poolsInfo[address].underlyingTokens,
            rewardTokens: rewardTokens
        })
        console.log(rewardTokens)
    }
    // console.log(boostedApy)

    const pools = boostedApy
        .map((pool) => {
            return {
                pool: `${pool.address}-ton`.toLowerCase(),
                chain: 'Ton',
                project: 'dedust',
                symbol: pool.symbol,
                tvlUsd: pool.tvl,
                apyBase: pool.apyBase,
                apyReward: pool.apyReward,
                rewardTokens: pool.rewardTokens,
                underlyingTokens: pool.underlyingTokens,
                url: `https://dedust.io/pools/${pool.address}`
            };
        }).filter((pool) => pool != null);
    return pools;
};

module.exports = {
    timetravel: false,
    apy: getApy,
    url: 'https://dedust.io/',
};
