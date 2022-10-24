const axios = require('axios');
const utils = require('../utils');

function getSymbol(name) {
  if (name === 'WETHWAVAXJLP') {
    return 'WETH-WAVAX';
  } else if (name === 'AVAXUSDCJLP') {
    return 'AVAX-USDC';
  }

  return name;
}

async function apr() {
  const [
    { data: vaults },
    { data: tvls },
    { data: prices },
    { data: aprs },
    { data: vaultToName },
    { data: underlyingTokens },
    { data: yusdData },
  ] = await Promise.all([
    axios.get(`https://api.yeti.finance/v1/yeticontroller/vaults`),
    axios.get(`https://api.yeti.finance/v1/yeticontroller/tvls`),
    axios.get(`https://api.yeti.finance/v1/yeticontroller/prices`),
    axios.get(`https://api.yeti.finance/v1/collaterals`),
    axios.get(`https://api.yeti.finance/v1/yeticontroller/vaultToName`),
    axios.get(`https://api.yeti.finance/v1/yeticontroller/underlyingTokens`),
    axios.get(`https://api.yeti.finance/v1/yusd/avax`),
  ]);

  const vaultsLength = vaults.length;

  underlying = {};

  for (var i = 0; i < vaultsLength; i++) {
    underlying[vaults[i]] = underlyingTokens[i];
  }

  const vaultsToExclude = ['WAVAX', 'USDC', 'WETH', 'WBTC', 'av3CRV'];

  let vaultAPRs = [
    ...vaults.filter(
      (v) =>
        v !== '0x0000000000000000000000000000000000000000' &&
        !vaultsToExclude.includes(vaultToName[v])
    ),
  ].map((v) => ({
    pool: `Yeti-${vaultToName[v]}-Vault`,
    chain: 'Avalanche',
    project: 'yeti-finance',
    symbol: getSymbol(vaultToName[v]),
    tvlUsd: ((Number(tvls[v]) / 10 ** 18) * Number(prices[v])) / 10 ** 18,
    apy: Number(aprs[vaultToName[v]].APY.value) * 100,
    underlyingTokens: [underlying[v]],
  }));

  const stabilityPool = [
    {
      pool: `Yeti-YUSD-StabilityPool`,
      chain: 'Avalanche',
      project: 'yeti-finance',
      symbol: 'YUSD',
      tvlUsd:
        Number(yusdData.stabilityPoolDeposits.value) *
        Number(yusdData.YUSDPrice.value),
      apy: Number(yusdData.stabilityPoolAPR.value) * 100,
      underlyingTokens: ['0x111111111111ed1D73f860F57b2798b683f2d325'],
    },
  ];

  vaultAPRs = vaultAPRs.concat(stabilityPool);

  return vaultAPRs;
}

const main = async () => {
  return await apr();
};

module.exports = {
  timetravel: false,
  apy: main,
  url: 'https://app.yeti.finance/',
};
