const utils = require('../utils');

const poolsFunction = async () => {
  const dataTvl = await utils.getData('https://bolide.fi/api/tvl');
  const apyData = await utils.getData('https://bolide.fi/api/apy');

  const lrsTvl = dataTvl.strategiesTvl.find(
    ({ name }) => name === 'LOW_RISK_STRATEGY'
  ).tvl;
  const lrsApy = apyData.strategiesApy.find(
    ({ name }) => name === 'LOW_RISK_STRATEGY'
  ).apy;

  const btcTvl = dataTvl.strategiesTvl.find(
    ({ name }) => name === 'BTC Strategy'
  ).tvl;
  const btcApy = apyData.strategiesApy.find(
    ({ name }) => name === 'BTC Strategy'
  ).apy;

  const ethTvl = dataTvl.strategiesTvl.find(
    ({ name }) => name === 'ETH Strategy'
  ).tvl;
  const ethApy = apyData.strategiesApy.find(
    ({ name }) => name === 'ETH Strategy'
  ).apy;

  const lowRiskPools = [
    {
      pool: '0xf1f25A26499B023200B3f9A30a8eCEE87b031Ee1' + 'USDT',
      chain: 'binance',
      project: 'bolide',
      symbol: 'USDT-USDC-BUSD-DAI',
      tvlUsd: lrsTvl,
      apy: lrsApy,
    },
  ];

  const btcPools = [
    {
      pool: '0xed18f1CE58fED758C7937cC0b8BE66CB02Dc45c6' + 'BTC',
      chain: 'binance',
      project: 'bolide',
      symbol: 'BTC',
      tvlUsd: btcTvl,
      apy: btcApy,
    },
  ];

  const ethPools = [
    {
      pool: '0x941ef9AaF3277052e2e6c737ae9a75b229A20988' + 'ETH',
      chain: 'binance',
      project: 'bolide',
      symbol: 'ETH',
      tvlUsd: ethTvl,
      apy: ethApy,
    },
  ];

  const stakingBlid = [
    {
      pool: '0x3782C47E62b13d579fe748946AEf7142B45B2cf7' + '0',
      chain: 'binance',
      project: 'bolide',
      symbol: 'BLID',
      tvlUsd: dataTvl.stakingTvl,
      apy: apyData.stakingApy,
    },
  ];

  const farmingBlidUsdt = [
    {
      pool: '0x3782C47E62b13d579fe748946AEf7142B45B2cf7' + '1',
      chain: 'binance',
      project: 'bolide',
      symbol: 'BLID-USDT',
      tvlUsd: dataTvl.farmingTvl,
      apy: apyData.farmingApy,
    },
  ];

  return [
    ...lowRiskPools,
    ...btcPools,
    ...ethPools,
    ...stakingBlid,
    ...farmingBlidUsdt,
  ];
};

module.exports = {
  timetravel: false,
  apy: poolsFunction,
  url: 'https://app.bolide.fi/#/',
};
