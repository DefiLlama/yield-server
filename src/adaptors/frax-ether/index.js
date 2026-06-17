const sdk = require('@defillama/sdk');
const axios = require('axios');
const { getPriceApiData } = require('../utils');

const token = '0xac3e018457b222d93114458476f3e3416abbe38f';

const getApy = async () => {
  const tvl =
    (await sdk.api.erc20.totalSupply({ target: token })).output / 1e18;

  const apyData = (
    await axios.get('https://api.frax.finance/v2/frxeth/summary/latest')
  ).data;
  const priceKey = 'ethereum:0x0000000000000000000000000000000000000000';
  const ethPrice = (await getPriceApiData(`/prices/current/${priceKey}`)).coins[priceKey]?.price;

  return [
    {
      pool: token,
      chain: 'ethereum',
      project: 'frax-ether',
      symbol: 'sfrxeth',
      tvlUsd: tvl * ethPrice,
      apyBase: apyData.sfrxethApr,
      underlyingTokens: ['0x0000000000000000000000000000000000000000'],
      searchTokenOverride: token,
      isIntrinsicSource: true,
    },
  ];
};

module.exports = {
  protocolId: '2221',
  timetravel: false,
  apy: getApy,
  url: 'https://app.frax.finance/frxeth/mint',
};
