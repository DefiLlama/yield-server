const utils = require('../utils');

const baseUrl = 'https://yzo0r3ahok.execute-api.us-east-1.amazonaws.com/dev/api';
const ftmUrl = baseUrl+'/crypts';
const optUrl = baseUrl+'/optimism/crypts';

const networkMapping = {
  10: 'optimism',
  250: 'fantom',
};

const main = async () => {

  const [ftmCrypts, optCrypts] = await Promise.all(
    [ftmUrl, optUrl].map((u) => utils.getData(u))
  );

  const cryptMapping = {
    10: optCrypts.data,
    250: ftmCrypts.data,
  };

  let data = [];
  for (const chain of Object.keys(networkMapping)) {
    let poolData = cryptMapping[chain];
    for (const pool of poolData) {
      const cryptObj = pool.cryptContent;
      const vaultId = cryptObj.vault.address;
      let symbol = cryptObj.tokens[0].name;
      for (let i=1; i<cryptObj.tokens.length; i++) {
        symbol = symbol + '-' + cryptObj.tokens[i].name;
      }
      
      if (pool.analytics.yields.year !== 0 && !cryptObj.dead) {
        data.push({
          pool: `${vaultId}-${networkMapping[chain]}`.toLowerCase(),
          chain: utils.formatChain(networkMapping[chain]),
          project: 'reaper-farm',
          symbol: symbol,
          tvlUsd: pool.analytics.tvl,
          apy: pool.analytics.yields.year*100,
        });
      }
    }
  }
  return data;
};


module.exports = {
  timetravel: false,
  apy: main,
  url: 'https://reaper.farm/',
};