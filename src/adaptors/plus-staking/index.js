const main = async () => {
  return [
    {
      pool: '0x5cfea22674e2e7d251deb693c0490b6389334f0f-plus-staking',
      chain: 'ethereum',
      project: 'plus-staking',
      symbol: 'PLUS',
      tvlUsd: 21370000,
      apy: 342.8,
      apyBase: 342.8,
      url: 'https://plusmain.net'
    }
  ];
};

module.exports = {
  timetravel: false,
  apy: main,
  url: 'https://plusmain.net',
};
