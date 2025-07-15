const axios = require('axios');
const sdk = require('@defillama/sdk');

const STAKING_CONTRACT = '0x1adB950d8bB3dA4bE104211D5AB038628e477fE6';
const SLISBNB = '0xB0b84D294e0C75A6abe60171b70edEb2EFd14A1B';
const BNB = '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c';

const abi = {
  getTotalPooledBnb: {
    inputs: [],
    name: 'getTotalPooledBnb',
    outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
};

const apy = async () => {
  const [totalPooledBnb, apyData, bnbPrice] = await Promise.all([
    sdk.api.abi.call({
      target: STAKING_CONTRACT,
      abi: abi.getTotalPooledBnb,
      chain: 'bsc',
    }),
    axios.get('https://api.lista.org/v1/stakes/latest-apr'),
    axios.get(
      'https://coins.llama.fi/prices/current/bsc:0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c'
    ),
  ]);

  const tvlUsd =
    (totalPooledBnb.output / 1e18) *
    bnbPrice.data.coins['bsc:0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c'].price;
  const apyBase =
    (parseFloat(apyData.data.data.apr) +
      parseFloat(apyData.data.data.launchPoolApy)) *
    100;

  return [
    {
      pool: SLISBNB,
      chain: 'bsc',
      project: 'lista-liquid-staking',
      symbol: 'slisBNB',
      tvlUsd,
      apyBase,
      underlyingTokens: [SLISBNB],
      url: 'https://lista.org/liquid-staking/BNB',
      poolMeta:
        'Launchpool rewards require clisBNB staking on Binance Launchpool',
    },
  ];
};

module.exports = {
  apy,
  url: 'https://lista.org/liquid-staking/BNB',
};
