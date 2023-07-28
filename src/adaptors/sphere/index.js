const utils = require('../utils');
const axios = require('axios');

const url = 'https://api.dyson.money';
const urlApy = `${url}/apy`;
const urlTvl = `${url}/tvl`;
const urlMeta = `${url}/vaults`;

const networkMapping = {
    10: 'optimism',
    56: 'binance',
    137: 'polygon',
    42161: 'arbitrum',
    43114: 'avalanche',
};

const sphereMapping = {
    10: '0x62F594339830b90AE4C084aE7D223fFAFd9658A7',
    56: '0x62F594339830b90AE4C084aE7D223fFAFd9658A7',
    137: '0x62F594339830b90AE4C084aE7D223fFAFd9658A7',
    42161: '0x62F594339830b90AE4C084aE7D223fFAFd9658A7',
    43114: '0x62F594339830b90AE4C084aE7D223fFAFd9658A7',
};
const main = async () => {
    const [tvl, meta] = await Promise.all([
        urlTvl, urlMeta
    ].map((u) => utils.getData(u)))
    const apyResponse = await axios.get(urlApy)
    const apy = apyResponse.data
    let data = []
    for (const chain of Object.keys(networkMapping)) {
        const poolData = tvl[chain];
        for (const pool of Object.keys(poolData)) {
            if (apy[pool] === undefined)
                continue;
            const poolMeta = meta.find(m => m?.id === pool);
            const platformId = poolMeta?.platformId;

            const poolId = poolMeta === undefined ? sphereMapping[chain] : poolMeta.earnedTokenAddress;
            const isActive = poolMeta === undefined || poolMeta.status == 'active';

            if (!poolId) continue;

            const underlyingTokens = (!!poolMeta && poolMeta.assets.length === 1 && poolMeta.tokenAddress) ? [poolMeta.tokenAddress] : undefined;

            data.push({
                pool: `${poolId}-${networkMapping[chain]}`.toLowerCase(),
                chain: utils.formatChain(networkMapping[chain]),
                project: 'sphere',
                symbol:
                  poolMeta === undefined
                    ? 'SPHERE'
                    : utils.formatSymbol(poolMeta?.assets.join('-')),
                tvlUsd: poolData[pool],
                apy: isActive ? apy[pool] * 100 : 0,
                poolMeta:
                  platformId === undefined ? null : utils.formatChain(platformId),
                underlyingTokens,
              });
        }
    }

    return data;
}

module.exports = {
    timetravel: false,
    apy: main,
    url: 'https://app.dyson.money/',
  };