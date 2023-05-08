const axios = require('axios');

const apiUrl_avax = 'https://data.cian.app/api/v1/staking_avax/apr';
const apiUrl_btc = 'https://data.cian.app/api/v1/staking_btc/apr';
const apiUrl_maticx = 'https://data.cian.app/polygon/api/v1/staking_matic/apy';
const apiUrl_stmatic = 'https://data.cian.app/polygon/api/v1/staking_stmatic/apy';
const apiUrl_maticX6x = "https://data.cian.app/polygon/api/v1/staking_matic6x/apy";
const apiUrl_steth = 'https://data.cian.app/ethereum/api/v1/staking_eth/apy';

async function fetch() {
  const response_avax = (await axios.get(apiUrl_avax)).data.data;
  const response_btc = (await axios.get(apiUrl_btc)).data.data;
  const response_maticx = (await axios.get(apiUrl_maticx)).data.data;
  const response_stmatic = (await axios.get(apiUrl_stmatic)).data.data;
  const response_maticX6x = (await axios.get(apiUrl_maticX6x)).data.data;
  const response_steth = (await axios.get(apiUrl_steth)).data.data;
  return [...response_avax, ...response_btc, ...response_maticx, ...response_stmatic, ...response_maticX6x, response_steth];
}

const main = async () => {
  const data = await fetch();

  return data.filter(p => p).map((p) => {
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
