const sdk = require('@defillama/sdk');
const axios = require('axios');

const token = '0xfe2e637202056d30016725477c5da089ab0a043a';
const weth = '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2';

const getApy = async () => {
  const tvl =
    (await sdk.api.erc20.totalSupply({ target: token })).output / 1e18;

  const apyData = (
    await axios.get('https://api.stakewise.io/pool-stats/?network=mainnet')
  ).data;
  const priceKey = `ethereum:${weth}`;
  const ethPrice = (
    await axios.get(`https://coins.llama.fi/prices/current/${priceKey}`)
  ).data.coins[priceKey]?.price;

  const fee = 0.1;
  return [
    {
      pool: token,
      chain: 'ethereum',
      project: 'stakewise',
      symbol: 'seth2',
      tvlUsd: tvl * ethPrice,
      apy: Number(apyData.validators_apr) * (1 - fee),
      underlyingTokens: [weth],
    },
  ];
};

module.exports = {
  timetravel: false,
  apy: getApy,
  url: 'https://app.stakewise.io/',
};
