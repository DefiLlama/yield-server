const sdk = require('@defillama/sdk');
const axios = require('axios');
const { getPriceApiData } = require('../utils');

const token = '0x9559aaa82d9649c7a7b220e7c461d2e74c9a3593';

const getApy = async () => {
  const tvl =
    (await sdk.api.erc20.totalSupply({ target: token })).output / 1e18;

  const apyData = (
    await axios.get('https://drop-api.stafi.io/reth/v1/poolData')
  ).data;
  const priceKey = 'ethereum:0x0000000000000000000000000000000000000000';
  const ethPrice = (await getPriceApiData(`/prices/current/${priceKey}`)).coins[priceKey]?.price;

  return [
    {
      pool: token,
      chain: 'ethereum',
      project: 'stafi',
      symbol: 'reth',
      tvlUsd: tvl * ethPrice,
      apyBase: apyData.data.stakeApr,
      underlyingTokens: ['0x0000000000000000000000000000000000000000'],
      searchTokenOverride: token,
      isIntrinsicSource: true,
    },
  ];
};

module.exports = {
  protocolId: '276',
  timetravel: false,
  apy: getApy,
  url: 'https://bifrost.app/vstaking',
};
