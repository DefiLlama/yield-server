const axios = require('axios');
const sdk = require('@defillama/sdk');

const stUSDT = 'TThzxNRLrW2Brp9DcTQU8i4Wd9udCWEdZ3';
const stUSDTEthereum = '0x25ec98773d7b4ced4cafab96a2a1c0945f145e10';

const apy = async () => {
  const balanceTron = (
    await sdk.api.abi.call({
      chain: 'tron',
      abi: 'erc20:totalSupply',
      target: stUSDT,
    })
  ).output;

  const balanceEthereum = (
    await sdk.api.abi.call({
      chain: 'ethereum',
      abi: 'erc20:totalSupply',
      target: stUSDTEthereum,
    })
  ).output;

  const apys = await Promise.all(
    ['stusdt/dashboard', 'ethereum/stusdt/dashboard'].map((i) =>
      axios.get(`https://api.stusdt.org/${i}`)
    )
  );

  return [
    {
      pool: stUSDT,
      chain: 'tron',
      project: 'stusdt',
      symbol: 'stusdt',
      apy: apys[0].data.data.apy * 100,
      tvlUsd: balanceTron / 1e18,
      underlyingTokens: ['TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t'],
      url: 'https://stusdt.io/tron/?lang=en-US#/stake',
    },
    {
      pool: stUSDTEthereum,
      chain: 'ethereum',
      project: 'stusdt',
      symbol: 'stusdt',
      apy: apys[1].data.data.apy * 100,
      tvlUsd: balanceEthereum / 1e18,
      underlyingTokens: ['0xdAC17F958D2ee523a2206206994597C13D831ec7'],
      url: 'https://stusdt.io/?lang=en-US#/stake',
    },
  ];
};

module.exports = {
  apy,
  url: 'test',
};
