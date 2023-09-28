const utils = require('../utils');
const superagent = require('superagent');

const AUTH_TOKEN_ENCODED =
  'ZXlKaGJHY2lPaUpJVXpJMU5pSXNJblI1Y0NJNklrcFhWQ0o5LmV5SmpiR2xsYm5SSlpDSTZJa0Z3Y0RZaUxDSnBZWFFpT2pFMk56QXlNemMxTWpkOS5rbnNtekVOSm40Yk5Ea0ZCM3h2eWZyaDBwVlFLTHY0NW9JanJQNHdRTU5N';

const mainnetPoolsUrl = 'https://api.idle.finance/pools';
// const polygonPoolsUrl = 'https://api-polygon.idle.finance/pools';

const chains = {
  eth: 'ethereum',
  // matic: 'polygon',
};

async function getDataWithAuth(url, token) {
  const data = await superagent
    .get(url)
    .set('Authorization', `Bearer ${token}`);
  return data?.body;
}

async function apy() {
  const AUTH_TOKEN_DECODED = atob(AUTH_TOKEN_ENCODED);
  const mainnetPoolsResponse = await getDataWithAuth(
    mainnetPoolsUrl,
    AUTH_TOKEN_DECODED
  );

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
      poolMeta: v.poolName.includes('Best')
        ? v.poolName.split(' ').slice(1).join(' ')
        : v.strategy,
      tvlUsd: Number(v.tvl),
      project: 'idle',
      chain: utils.formatChain(chains[chain]),
      underlyingTokens: [v.underlyingAddress],
    }));

    allVaults = [...allVaults, ...pools];
  }

  return allVaults;
}

const main = async () => {
  return await apy();
};

module.exports = {
  apy: main,
  timetravel: false,
  url: 'https://app.idle.finance/#/best',
};
