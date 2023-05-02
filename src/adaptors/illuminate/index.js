const sdk = require('@defillama/sdk');
const utils = require('../utils');

const marketPlace = '0xcd1D02fDa51CD24123e857CE94e4356D5C073b3f';
const pool = require('./abis/Pool.abi');
const erc5095 = require('./abis/ERC5095.abi');

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
    });
  }

// get the tvl of a pt
async function getTvl(pt, pool) {
    const decimals = await sdk.api.abi.call({
        target: pt,
        abi: erc5095['decimals'],
        chain: 'ethereum',
        params: [],
    });
    const one = 10 ** decimals;
    const totalSupply = await sdk.api.abi.call({
        target: pt,
        abi: erc5095['totalSupply'],
        chain: 'ethereum',
        params: [],
    });
    const fyTokenValue = await sdk.api.abi.call({
        target: pool,
        abi: pool['sellFYTokenPreview'],
        chain: 'ethereum',
        params: [one],
    });

    return totalSupply * fyTokenValue / one;
}

// get the base (fixed) apy of a pool
async function getBaseApy(pt, pool) {
    const decimals = await sdk.api.abi.call({
        target: pt,
        abi: erc5095['decimals'],
        chain: 'ethereum',
        params: [],
    });
    const one = 10 ** decimals;
    const baseTokenValue = await sdk.api.abi.coll({
        target: pool,
        abi: pool['sellBasePreview'],
        chain: 'ethereum',
        params: [one],
    });

    return (baseTokenValue - one) / one;
}

const main = async () => {
    let data = await utils.getData(
        'https://illumigate-main.swivel.exchange/v1/pools'
    );
    const project = 'illuminate';
    data = data.map((p) => { // TODO: make this async
        // fetch symbol of the pt
        sdk.abi.api.call(['symbol'], p.pt);
        return {
            pool: p.address,
            chain: 'ethereum',
            project: 'illuminate',
            symbol: getSymbol(p.pt),
            tvlUsd: getTvl(p.pt, p.address),
            apyBase: getBaseApy(p.pt, p.address),
            apyReward: p.apy, // pool APY
            rewardTokens: [],
            underlyingTokens: [p.underlying],
            poolMeta: '',
        };
    });

    return data;
}

module.exports = {
    timetravel: false,
    apy: main,
    url: 'https://illumigate-main.swivel.exchange/v1/pools'
}