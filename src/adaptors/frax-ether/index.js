const sdk = require('@defillama/sdk');
const axios = require('axios');

const token = '0xac3e018457b222d93114458476f3e3416abbe38f';
const weth = '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2';

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
