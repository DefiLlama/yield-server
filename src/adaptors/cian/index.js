const axios = require('axios');

const apiUrl_avax = 'https://data.cian.app/api/v1/staking_avax/apr';
const apiUrl_btc = 'https://data.cian.app/api/v1/staking_btc/apr';
const apiUrl_matic = 'https://data.cian.app/polygon/api/v1/staking_matic/apy';

async function fetch() {
  const response_avax = (await axios.get(apiUrl_avax)).data.data;
  const response_btc = (await axios.get(apiUrl_btc)).data.data;
  const response_matic = (await axios.get(apiUrl_matic)).data.data;
  return [...response_avax, ...response_btc, ...response_matic];
}

const main = async () => {
  const data = await fetch();

  return data.map((p) => {
    // if - in symbol -> split, keep 1 in array, otherwise don't split
    let symbolSplit = p.symbol.split('-');
    symbolSplit = symbolSplit.length > 1 ? symbolSplit[1] : symbolSplit[0];
    const symbol = symbolSplit.replace(/ *\([^)]*\) */g, '');
    // extract content within () -> meta data
    const poolMeta = /\(([^)]+)\)/.exec(symbolSplit)[1];

    return {
      ...p,
      symbol,
      poolMeta,
    };
  });
};

module.exports = {
  timetravel: false,
  apy: main,
  url: 'https://dapp.cian.app',
};
