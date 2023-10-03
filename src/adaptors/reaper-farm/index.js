const utils = require('../utils');

const baseUrl = 'https://2ch9hbg8hh.execute-api.us-east-1.amazonaws.com/dev/api';
const ftmUrl = baseUrl+'/vaults/0xfa';
const optUrl = baseUrl+'/vaults/0xa';
const arbUrl = baseUrl+'/vaults/0xa4b1';

const networkMapping = {
  10: 'optimism',
  250: 'fantom',
  42161: 'arbitrum',
};

const main = async () => {

  const [ftmVaults, optVaults, arbVaults] = await Promise.all(
    [ftmUrl, optUrl, arbUrl].map((u) => utils.getData(u))
  );

  const vaultsMapping = {
    10: optVaults.data,
    250: ftmVaults.data,
    42161: arbVaults.data,
  };

  let data = [];
  for (const chain of Object.keys(networkMapping)) {
    let poolData = vaultsMapping[chain];
    Object.values(poolData).forEach((pool) => {
      const vaultId = pool.address;
      let symbol = pool.tokens.lpToken.symbol;
      let underlyingTokens = [];
      if (pool.tokens.underlyingTokens.length !== 0) {
        underlyingTokens = pool.tokens.underlyingTokens.map((tokenObj) => {
          return tokenObj.address;
        })
      } else {
        underlyingTokens.push(pool.tokens.lpToken.address);
      }
      
      if (pool.yields.apy != 0) {
        data.push({
          pool: `${vaultId}-${networkMapping[chain]}`.toLowerCase(),
          chain: utils.formatChain(networkMapping[chain]),
          project: 'reaper-farm',
          symbol: symbol,
          tvlUsd: pool.tvl.tvl,
          apy: pool.yields.apy*100,
          underlyingTokens: underlyingTokens,
        });
      }
    })
  }
  return data.filter(
    (p) =>
      ![
        '0x152d62dccc2c7c7930c4483cc2a24fefd23c24c2-fantom',
        '0x5427f192137405e6a4143d1c3321359bab2dbd87-fantom',
      ].includes(p.pool)
  );
};


module.exports = {
  timetravel: false,
  apy: main,
  url: 'https://reaper.farm/',
};