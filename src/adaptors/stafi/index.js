const sdk = require('@defillama/sdk');
const axios = require('axios');

const token = '0x9559aaa82d9649c7a7b220e7c461d2e74c9a3593';

const getApy = async () => {
  const tvl =
    (await sdk.api.erc20.totalSupply({ target: token })).output / 1e18;

  const apyData = (
    await axios.get('https://drop-api.stafi.io/reth/v1/poolData')
  ).data;
  const priceKey = 'ethereum:0x0000000000000000000000000000000000000000';
  const ethPrice = (
    await axios.get(`https://coins.llama.fi/prices/current/${priceKey}`)
  ).data.coins[priceKey]?.price;

  return [
    {
      pool: token,
      chain: 'ethereum',
      project: 'stafi',
      symbol: 'reth',
      tvlUsd: tvl * ethPrice,
      apyBase: apyData.data.stakeApr,
      underlyingTokens: ['0x0000000000000000000000000000000000000000'],
      token: token,
    },
  ];
};

module.exports = {
  timetravel: false,
  apy: getApy,
  url: 'https://bifrost.app/vstaking',
};
