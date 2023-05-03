const utils = require('../utils');
const { readFromS3 } = require('../../utils/s3');
const _ = require('lodash');

const BLID = '0x8a7adc1b690e81c758f1bd0f72dfe27ae6ec56a5';

const poolsFunction = async () => {
  // const dataTvl = await utils.getData('https://bolide.fi/api/tvl');
  // const apyData = await utils.getData('https://bolide.fi/api/apy');

  // reading data from s3 (like with harvest-finance)
  const data = await readFromS3('llama-apy-prod-data', 'bolide_api_data.json');

  const dataTvl = data['tvl'];
  const apyData = data['apy'];

  const VAULTS_NAMES = {
    LRS: 'LOW_RISK_STRATEGY',
    BTC: 'BTC Strategy',
    ETH: 'ETH Strategy',
    ALTCOINS: 'Altcoins Strategy',
  };

  const VAULTS_TOKENS = {
    LRS: ['USDT', 'USDC', 'BUSD', 'DAI'],
    BTC: ['BTC'],
    ETH: ['ETH'],
    ALTCOINS: ['XRP', 'XVS', 'LTC', 'ADA', 'LINK', 'DOT', 'MATIC'],
  };

  const VAULTS_ADDRESSES = {
    LRS: '0xf1f25A26499B023200B3f9A30a8eCEE87b031Ee1',
    BTC: '0xed18f1CE58fED758C7937cC0b8BE66CB02Dc45c6',
    ETH: '0x941ef9AaF3277052e2e6c737ae9a75b229A20988',
    ALTCOINS: '0x5d735e9ffE9664B80c405D16921912E5B989688C',
  };

  const tvls = _.keyBy(dataTvl.strategiesTvl, 'name');
  const apys = _.keyBy(apyData.strategiesApy, 'name');

  const pools = [];

  for (const key in VAULTS_NAMES) {
    const name = VAULTS_NAMES[key];
    const address = VAULTS_ADDRESSES[key];
    const tokens = VAULTS_TOKENS[key];

    const vaultTvl = tvls[name];
    const vaultApy = apys[name];

    for (const token of tokens) {
      if (vaultTvl.tokensTvl[token]) {
        const tvlUsd = vaultTvl.tokensTvl[token].tvl;

        pools.push({
          pool: `${address}${token}`,
          chain: 'binance',
          project: 'bolide',
          symbol: token,
          tvlUsd,
          apyReward: vaultApy.baseApy,
          rewardTokens: [BLID],
        });
      }
    }
  }

  const stakingBlid = [
    {
      pool: '0x3782C47E62b13d579fe748946AEf7142B45B2cf7' + '0',
      chain: 'binance',
      project: 'bolide',
      symbol: 'BLID',
      tvlUsd: Number(dataTvl.stakingTvl),
      apyReward: Number(apyData.stakingApy),
      rewardTokens: [BLID],
    },
  ];

  const farmingBlidUsdt = [
    {
      pool: '0x3782C47E62b13d579fe748946AEf7142B45B2cf7' + '1',
      chain: 'binance',
      project: 'bolide',
      symbol: 'BLID-USDT',
      tvlUsd: Number(dataTvl.farmingTvl),
      apyReward: Number(apyData.farmingApy),
      rewardTokens: [BLID],
    },
  ];

  return [...pools, ...stakingBlid, ...farmingBlidUsdt];
};

module.exports = {
  timetravel: false,
  apy: poolsFunction,
  url: 'https://app.bolide.fi/#/',
};
