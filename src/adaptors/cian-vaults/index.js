const axios = require('axios');

const apiUrl_avax = 'https://data.cian.app/api/v1/staking_avax/apr';
const apiUrl_btc = 'https://data.cian.app/api/v1/staking_btc/apr';
const apiUrl_maticx = 'https://data.cian.app/polygon/api/v1/staking_matic/apy';
const apiUrl_stmatic =
  'https://data.cian.app/polygon/api/v1/staking_stmatic/apy';
const apiUrl_maticX6x =
  'https://data.cian.app/polygon/api/v1/staking_matic6x/apy';
const apiUrl_steth = 'https://data.cian.app/ethereum/api/v1/staking_eth/apy';
const apiUrl_matrixport =
  'https://data.cian.app/ethereum/api/v1/staking_in1_eth/apy';
const apiUrl_stethVault_eth =
  'https://data.cian.app/ethereum/api/v1/eth_vault_steth/apy';
const apiUrl_wstethVault_arbitrum =
  'https://data.cian.app/arbitrum/api/v1/arb_vault_wsteth/apy';
const apiUrl_wstethVault_optimism =
  'https://data.cian.app/optimism/api/v1/op_vault_wsteth/apy';
const apiUrl_wbethVault_bsc =
  'https://data.cian.app/bsc/api/v1/bsc_vault_wbeth/apy';

async function fetch() {
  const response_avax = (await axios.get(apiUrl_avax)).data.data;
  const response_btc = (await axios.get(apiUrl_btc)).data.data;
  const response_maticx = (await axios.get(apiUrl_maticx)).data.data;
  const response_stmatic = (await axios.get(apiUrl_stmatic)).data.data;
  const response_maticX6x = (await axios.get(apiUrl_maticX6x)).data.data;
  const response_steth = (await axios.get(apiUrl_steth)).data.data;
  const response_matrixport = (await axios.get(apiUrl_matrixport)).data.data;
  const response_stethVault_eth = (await axios.get(apiUrl_stethVault_eth)).data
    .data;
  const response_wstethVault_arbitrum = (
    await axios.get(apiUrl_wstethVault_arbitrum)
  ).data.data;
  const response_wstethVault_optimism = (
    await axios.get(apiUrl_wstethVault_optimism)
  ).data.data;
  const response_wbethVault_bsc = (await axios.get(apiUrl_wbethVault_bsc)).data
    .data;

  return [
    ...response_avax,
    ...response_btc,
    ...response_maticx,
    ...response_stmatic,
    ...response_maticX6x,
    response_steth,
    response_matrixport,
    response_stethVault_eth,
    response_wstethVault_arbitrum,
    response_wstethVault_optimism,
    response_wbethVault_bsc,
  ];
}

const main = async () => {
  const data = await fetch();

  return data
    .filter((p) => p)
    .map((p) => {
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
        project: 'cian-vaults',
      };
    });
};

module.exports = {
  timetravel: false,
  apy: main,
  url: 'https://dapp.cian.app',
};
