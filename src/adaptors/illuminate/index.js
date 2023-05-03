const sdk = require('@defillama/sdk');
const axios = require('axios');

const marketPlace = '0xcd1D02fDa51CD24123e857CE94e4356D5C073b3f';
const poolAbi = require('./abis/Pool.json');
const erc5095 = require('./abis/ERC5095.json');

// get all create market events
// get all set pool events
// get pool apy based on sellBasePreview

// get symbol of a principal token
async function getSymbol(pt) {
    return (await sdk.api.abi.call({
      target: pt,
      abi: erc5095.find((i) => i.name === 'symbol'),
      chain: 'ethereum',
    })).output;
  }

// get the tvl of a pt
async function getTvl(pt, pool) {
    const decimals = (await sdk.api.abi.call({
        target: pt,
        abi: erc5095.find((i) => i.name === 'decimals'),
        chain: 'ethereum',
    })).output;
    const one = 10 ** decimals;
    const totalSupply = (await sdk.api.abi.call({
        target: pt,
        abi: erc5095.find((i) => i.name === 'totalSupply'),
        chain: 'ethereum',
    })).output;
    const fyTokenValue = (await sdk.api.abi.call({
        target: pool,
        abi: poolAbi.find((i) => i.name === 'sellFYTokenPreview'),
        chain: 'ethereum',
        params: [one],
    })).output;

    return totalSupply * fyTokenValue / one;
}

// get the base (fixed) apy of a pool
async function getBaseApy(pt, pool) {
    console.log('getting base APY');
    const decimals = (await sdk.api.abi.call({
        target: pt,
        abi: erc5095.find((i) => i.name === 'decimals'),
        chain: 'ethereum',
    })).output;
    console.log('decimals', decimals);

    const one = 10 ** decimals;
    console.log('one', one);

    const baseTokenValue = (await sdk.api.abi.coll({
        target: pool,
        abi: poolAbi['sellBasePreview'],
        chain: 'ethereum',
        params: [one],
    })).output;

    console.log('baseTokenValue', baseTokenValue);

    return (baseTokenValue - one) / one;
}

const main = async () => {
    let data = (await axios.get(
        'https://illumigate-main.swivel.exchange/v1/pools'
    ))['data'];
    data = await Promise.all(data.map(async p => {
        console.log('\nprocessing: ', p);
        return {
            pool: p.address,
            chain: 'ethereum',
            project: 'illuminate',
            symbol: await getSymbol(p.pt),
            tvlUsd: await getTvl(p.pt, p.address),
            apyBase: await getBaseApy(p.pt, p.address),
            apyReward: 0,
            rewardTokens: [],
            underlyingTokens: [p.underlying],
            poolMeta: '',
        };
    }));

    return data;
}

module.exports = {
    timetravel: false,
    apy: main,
    url: 'https://illumigate-main.swivel.exchange/v1/pools'
}