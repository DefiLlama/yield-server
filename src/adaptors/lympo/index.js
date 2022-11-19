const axios = require('axios');
const sdk = require('@defillama/sdk');

const poolsUrl = 'https://api.lympo.io/pools/poolsV2/pools.json';

const abi = {
    totalSupply: {
        inputs: [],
        name: 'totalSupply',
        outputs: [
            {
                internalType: 'uint256',
                name: '',
                type: 'uint256',
            },
        ],
        stateMutability: 'view',
        type: 'function',
    },
    totalStaked: {
        inputs: [],
        name: 'totalStaked',
        outputs: [
            {
                internalType: 'uint256',
                name: '',
                type: 'uint256',
            },
        ],
        stateMutability: 'view',
        type: 'function',
    }
}

async function getTVL(poolAddress, poolType, sportPrice) {
    let totalStaked;
    if(poolType === "minting") {
        totalStaked = (await sdk.api.abi.call({
            target: poolAddress,
            abi: abi.totalSupply,
            chain: "polygon",
        })).output
    } else if(poolType === "staking") {
        totalStaked = (await sdk.api.abi.call({
            target: poolAddress,
            abi: abi.totalStaked,
            chain: "polygon",
        })).output
    }

    return totalStaked / 1e18 * sportPrice;
}

const main = async () => {
    const poolsData = (await axios.get(poolsUrl)).data;
    const sportPrice = (await axios.get("https://api.coingecko.com/api/v3/simple/price?ids=sport&vs_currencies=USD")).data.sport.usd;

    const pools = [];

    for(pool of poolsData) {
        let obj = {
            "pool": pool.pool,
            "chain": pool.chain,
            "project": pool.project,
            "symbol": pool.symbol,
            "apy": 0
        }

        obj.tvlUsd = await getTVL(pool.address, pool.type, sportPrice)

        pools.push(obj);
    }

    return pools;

};

module.exports = {
    timetravel: false,
    apy: main,
    url: 'https://lympo.io',
};