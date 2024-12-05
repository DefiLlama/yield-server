const axios = require('axios');
const utils = require('../utils');

const fetchApy = async () => {
  const { data: apyData } = await axios.get(
    'https://events.glif.link/pool/apy'
  );

  const { data: metricsData } = await axios.get(
    'https://events.glif.link/metrics'
  );

  // div out the wad of 18 decimals
  let tvlFIL = metricsData.totalValueLocked / 10 ** 18;

  // <- Filecoin ->
  const filPriceKey = `coingecko:filecoin`;
  const filPrice = (
    await axios.get(`https://coins.llama.fi/prices/current/${filPriceKey}`)
  ).data.coins[filPriceKey]?.price;

  const filPool = {
    pool: '0x43dAe5624445e7679D16a63211c5ff368681500c-filecoin',
    chain: utils.formatChain('filecoin'),
    project: 'glif',
    symbol: utils.formatSymbol('IFIL'),
    tvlUsd: tvlFIL * filPrice,
    apy: Number(apyData.apy),
    poolMeta: 'GLIF',
  };

  return [filPool];
};

module.exports = {
  timetravel: false,
  apy: fetchApy,
  url: 'https://www.glif.io',
};
