const utils = require('../utils');
<<<<<<< HEAD
const mainnetPoolsUrl = 'https://api.idle.finance/pools?api-key=bPrtC2bfnAvapyXLgdvzVzW8u8igKv6E';
const polygonPoolsUrl = 'https://api-polygon.idle.finance/pools?api-key=bPrtC2bfnAvapyXLgdvzVzW8u8igKv6E';
=======
const superagent = require('superagent');

const AUTH_TOKEN_ENCODED = 'ZXlKaGJHY2lPaUpJVXpJMU5pSXNJblI1Y0NJNklrcFhWQ0o5LmV5SmpiR2xsYm5SSlpDSTZJa0Z3Y0RZaUxDSnBZWFFpT2pFMk56QXlNemMxTWpkOS5rbnNtekVOSm40Yk5Ea0ZCM3h2eWZyaDBwVlFLTHY0NW9JanJQNHdRTU5N'

const mainnetPoolsUrl = 'https://api.idle.finance/pools';
// const polygonPoolsUrl = 'https://api-polygon.idle.finance/pools';

>>>>>>> 36fc221f (FIX: Idle endpoint Authentication)
const chains = {
    "eth": "ethereum",
    "matic": "polygon"
};

async function getDataWithAuth(url, token){
  const data = await superagent.get(url).set('Authorization', `Bearer ${token}`);
  return data?.body
}

async function apy() {
<<<<<<< HEAD
    const mainnetPoolsResponse = await utils.getData(mainnetPoolsUrl);
    const polygonPoolsResponse = await utils.getData(polygonPoolsUrl);

    const poolsResponse = {
        'matic':polygonPoolsResponse,
        "eth":mainnetPoolsResponse
    };

    let allVaults = [];

    for (let chain of Object.keys(chains)) {
        const chainPools = Object.values(poolsResponse[chain]);

        const pools = chainPools.map(v => {
            var poolNameParts = v.poolName.split(' ');
            let poolName = (utils.formatSymbol(poolNameParts[0].toUpperCase())+' '+poolNameParts.slice(1,poolNameParts.length).join(' ')).trim();
            return {
                pool: v.address,
                apy: Number(v.apr),
                symbol: poolName,
                tvlUsd: Number(v.tvl),
                project: 'idle-finance',
                chain: utils.formatChain(chains[chain])
            };
        });

        allVaults = [...allVaults, ...pools];
    };

    return allVaults;
};
=======
  const AUTH_TOKEN_DECODED = atob(AUTH_TOKEN_ENCODED)
  const mainnetPoolsResponse = await getDataWithAuth(mainnetPoolsUrl, AUTH_TOKEN_DECODED)

  // console.log('mainnetPoolsResponse', mainnetPoolsResponse)
  // const polygonPoolsResponse = await utils.getData(polygonPoolsUrl);

  const poolsResponse = {
    // matic: polygonPoolsResponse,
    eth: mainnetPoolsResponse,
  };

  let allVaults = [];

  for (let chain of Object.keys(chains)) {
    const chainPools = Object.values(poolsResponse[chain]);

    const pools = chainPools.map((v) => ({
      pool: v.address,
      apyBase: Number(v.apr),
      symbol: v.tokenName,
      poolMeta: v.strategy,
      tvlUsd: Number(v.tvl),
      project: 'idle-finance',
      chain: utils.formatChain(chains[chain]),
      underlyingTokens: [v.underlyingAddress],
    }))

    allVaults = [...allVaults, ...pools];
  }

  return allVaults;
}
>>>>>>> 36fc221f (FIX: Idle endpoint Authentication)

const main = async () => {
    return await apy();
};

module.exports = {
    apy: main,
    timetravel: false,
};
