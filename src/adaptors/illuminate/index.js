const sdk = require('@defillama/sdk');
const axios = require('axios');

const marketPlace = '0xcd1D02fDa51CD24123e857CE94e4356D5C073b3f';
const pool = require('./abis/Pool.json');
const erc5095 = require('./abis/ERC5095.json');

// get all create market events
// get all set pool events
// get pool apy based on sellBasePreview

// get symbol of a principal token
async function getSymbol(pt) {
    return await sdk.api.abi.call({
      target: pt,
      abi: erc5095['symbol'],
      chain: 'ethereum',
      params: [],
    }).output;
  }

// get the tvl of a pt
async function getTvl(pt, pool) {
    const decimals = await sdk.api.abi.call({
        target: pt,
        abi: erc5095['decimals'],
        chain: 'ethereum',
        params: [],
    }).output;
    const one = 10 ** decimals;
    const totalSupply = await sdk.api.abi.call({
        target: pt,
        abi: erc5095['totalSupply'],
        chain: 'ethereum',
        params: [],
    }).output;
    const fyTokenValue = await sdk.api.abi.call({
        target: pool,
        abi: pool['sellFYTokenPreview'],
        chain: 'ethereum',
        params: [one],
    }).output;

    return totalSupply * fyTokenValue / one;
}

// get the base (fixed) apy of a pool
async function getBaseApy(pt, pool) {
    const decimals = (await sdk.api.abi.call({
        target: pt,
        abi: erc5095['decimals'],
        chain: 'ethereum',
        params: [],
    })).output;
    const one = 10 ** decimals;
    const baseTokenValue = (await sdk.api.abi.coll({
        target: pool,
        abi: pool['sellBasePreview'],
        chain: 'ethereum',
        params: [one],
    })).output;

    return (baseTokenValue - one) / one;
}

const main = async () => {
    let data = await axios.get(
        'https://illumigate-main.swivel.exchange/v1/pools'
    );
    data = await Promise.all(data.map(async p => {
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