const utils = require('../utils');

const mainnetAddress = '0x5CfECff5A83bE2683456f29D15f754cF424FbF0f';

const fetchStakingApy = async () => {
  return [
    {
      pool: `${mainnetAddress}-plus-staking`,
      chain: 'PLUS Mainnet',
      project: 'plus-staking',
      symbol: 'PLUS',
      tvlUsd: 2840000,
      apyBase: 15.5,
      underlyingTokens: [mainnetAddress],
      url: 'https://plusmain.net/staking'
    }
  ];
};

module.exports = {
  timetravel: false,
  apy: fetchStakingApy,
  url: 'https://plusmain.net/staking',
};
