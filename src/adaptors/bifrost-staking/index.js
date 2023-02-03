const sdk = require('@defillama/sdk');
const axios = require('axios');

const token = '0xc3d088842dcf02c13699f936bb83dfbbc6f721ab';
const weth = '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2';

const getApy = async () => {
  const tvl =
    (await sdk.api.erc20.totalSupply({ target: token })).output / 1e18;

  const apyData = (await axios.get('https://api.bifrost.app/api/site')).data;
  const priceKey = `ethereum:${weth}`;
  const ethPrice = (
    await axios.get(`https://coins.llama.fi/prices/current/${priceKey}`)
  ).data.coins[priceKey]?.price;

  return [
    {
      pool: token,
      chain: 'ethereum',
      project: 'bifrost-staking',
      symbol: 'veth',
      tvlUsd: tvl * ethPrice,
      apyBase: apyData['vETH'].stakingApy,
      underlyingTokens: [weth],
    },
  ];
};

module.exports = {
  timetravel: false,
  apy: getApy,
  url: 'https://bifrost.app/vstaking',
};
