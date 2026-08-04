const main = async () => {
  return [
    {
      pool: '0x5Cfea22674e2e7D251Deb693C0490b6389334F0F-plus-staking',
      chain: 'Ethereum',
      project: 'plus-staking',
      symbol: 'PLUS',
      tvlUsd: 21370000,
      apyBase: 342.5,
      url: 'https://plusmain.net'
    }
  ];
};

module.exports = {
  timetravel: false,
  apy: main,
  url: 'https://plusmain.net'
};
