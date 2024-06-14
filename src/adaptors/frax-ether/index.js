const ADDRESSES = require('../assets.json')
const sdk = require('@defillama/sdk');
const axios = require('axios');

const token = '0x5E8422345238F34275888049021821E8E08CAa1f';
const weth = ADDRESSES.ethereum.WETH;

const getApy = async () => {
  const tvl =
    (await sdk.api.erc20.totalSupply({ target: token })).output / 1e18;

  const apyData = (
    await axios.get('https://api.frax.finance/v2/frxeth/summary/latest')
  ).data;
  const priceKey = `ethereum:${weth}`;
  const ethPrice = (
    await axios.get(`https://coins.llama.fi/prices/current/${priceKey}`)
  ).data.coins[priceKey]?.price;

  return [
    {
      pool: token,
      chain: 'ethereum',
      project: 'frax-ether',
      symbol: 'sfrxeth',
      tvlUsd: tvl * ethPrice,
      apyBase: apyData.sfrxethApr,
      underlyingTokens: [weth],
    },
  ];
};

module.exports = {
  timetravel: false,
  apy: getApy,
  url: 'https://app.frax.finance/frxeth/mint',
};
