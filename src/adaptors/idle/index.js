const utils = require('../utils');
const superagent = require('superagent');

const chains = {
  ethereum: 'https://api.idle.finance/pools',
  polygon: 'https://api-polygon.idle.finance/pools',
  optimism: 'https://api-optimism.idle.finance/pools',
  polygon_zkevm: 'https://api-zkevm.idle.finance/pools',
};

const AUTH_TOKEN_ENCODED = 'ZXlKaGJHY2lPaUpJVXpJMU5pSXNJblI1Y0NJNklrcFhWQ0o5LmV5SmpiR2xsYm5SSlpDSTZJa0Z3Y0RZaUxDSnBZWFFpT2pFMk56QXlNemMxTWpkOS5rbnNtekVOSm40Yk5Ea0ZCM3h2eWZyaDBwVlFLTHY0NW9JanJQNHdRTU5N';

async function getDataWithAuth(url, token) {
  const data = await superagent
    .get(url)
    .set('Authorization', `Bearer ${token}`);
  return data?.body;
}

const getApy = async () => {
  const AUTH_TOKEN_DECODED = atob(AUTH_TOKEN_ENCODED);
  const data = await Promise.all(
    Object.entries(chains).map(async (chain) => {
      const data = await getDataWithAuth(chain[1], AUTH_TOKEN_DECODED);
      return data.map((v) => {
        let protocolName = v.protocolName;
        if (v.borrowerName){
          protocolName += ` ${v.borrowerName}`
        }
        const apyReward = v.apyReward || Number(0);
        const rewardTokens = v.rewardTokens || [];
        return {
          pool: v.address,
          apyBase: Number(v.apr),
          apyReward,
          rewardTokens,
          symbol: v.tokenName,
          poolMeta: v.poolName.includes('Best')
            ? v.poolName.split(' ').slice(1).join(' ')
            : `${protocolName} ${v.strategy}`,
          tvlUsd: Number(v.tvl),
          project: 'idle',
          chain: utils.formatChain(chain[0]),
          underlyingTokens: [v.underlyingAddress],
        }
      });
    })
  );

  return (
    data
      .flat()
  );
};

module.exports = {
  timetravel: false,
  apy: getApy,
  url: 'https://app.idle.finance/'
};
