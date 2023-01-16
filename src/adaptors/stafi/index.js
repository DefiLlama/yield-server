const sdk = require('@defillama/sdk');
const axios = require('axios');

const token = '0x9559aaa82d9649c7a7b220e7c461d2e74c9a3593';
const weth = '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2';

const getApy = async () => {
  const tvl =
    (await sdk.api.erc20.totalSupply({ target: token })).output / 1e18;

  const apyData = (
    await axios.get('https://drop-api.stafi.io/reth/v1/poolData')
  ).data;
  const priceKey = `ethereum:${weth}`;
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
      underlyingTokens: [weth],
    },
  ];
};

module.exports = {
  timetravel: false,
  apy: getApy,
  url: 'https://bifrost.app/vstaking',
};
