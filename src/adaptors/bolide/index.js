const utils = require('../utils');

const poolsFunction = async () => {
  const dataTvl = await utils.getData(
    'https://bolide.fi/api/tvl'
  );
  const apyData = await utils.getData(
    'https://bolide.fi/api/apy'
  );

  const lrsTvlData = dataTvl.strategiesTvl.find(({ name }) => name === 'LOW_RISK_STRATEGY');
  const lrsApyData = apyData.strategiesApy.find(({ name }) => name === 'LOW_RISK_STRATEGY');

  const btcTvlData = dataTvl.strategiesTvl.find(({ name }) => name === 'BTC Strategy');
  const btcApyData = apyData.strategiesApy.find(({ name }) => name === 'BTC Strategy');

  const ethTvlData = dataTvl.strategiesTvl.find(({ name }) => name === 'ETH Strategy');
  const ethApyData = apyData.strategiesApy.find(({ name }) => name === 'ETH Strategy');

  const lowRiskPools = [
    {
      pool: '0xf1f25A26499B023200B3f9A30a8eCEE87b031Ee1' + 'USDT',
      chain: 'binance',
      project: 'bolide',
      symbol: 'USDT',
      tvlUsd: lrsTvlData.tokensTvl['USDT'].tvl,
      apy: lrsApyData.apy
    },
    {
      pool: '0xf1f25A26499B023200B3f9A30a8eCEE87b031Ee1' + 'USDC',
      chain: 'binance',
      project: 'bolide',
      symbol: 'USDC',
      tvlUsd: lrsTvlData.tokensTvl['USDC'].tvl,
      apy: lrsApyData.apy
    },
    {
      pool: '0xf1f25A26499B023200B3f9A30a8eCEE87b031Ee1' + 'BUSD',
      chain: 'binance',
      project: 'bolide',
      symbol: 'BUSD',
      tvlUsd: lrsTvlData.tokensTvl['BUSD'].tvl,
      apy: lrsApyData.apy
    }
  ];

  const btcPools = [
    {
      pool: '0xed18f1CE58fED758C7937cC0b8BE66CB02Dc45c6' + 'BTC',
      chain: 'binance',
      project: 'bolide',
      symbol: 'BTC',
      tvlUsd: btcTvlData.tokensTvl['BTC'].tvl,
      apy: btcApyData.apy
    }
  ];

  const ethPools = [
    {
      pool: '0x941ef9AaF3277052e2e6c737ae9a75b229A20988' + 'ETH',
      chain: 'binance',
      project: 'bolide',
      symbol: 'ETH',
      tvlUsd: ethTvlData.tokensTvl['ETH'].tvl,
      apy: ethApyData.apy
    }
  ];

  const stakingBlid = [
    {
      pool: '0x3782C47E62b13d579fe748946AEf7142B45B2cf7' + '0',
      chain: 'binance',
      project: 'bolide',
      symbol: 'BLID',
      tvlUsd: dataTvl.stakingTvl,
      apy: apyData.stakingApy
    }
  ];

  const farmingBlidUsdt = [
    {
      pool: '0x3782C47E62b13d579fe748946AEf7142B45B2cf7' + '1',
      chain: 'binance',
      project: 'bolide',
      symbol: 'BLID-USDT',
      tvlUsd: dataTvl.farmingTvl,
      apy: apyData.farmingApy
    }
  ];

  return [
    ...lowRiskPools,
    ...btcPools,
    ...ethPools,
    ...stakingBlid,
    ...farmingBlidUsdt

  ];
};

module.exports = {
  timetravel: false,
  apy: poolsFunction
};
