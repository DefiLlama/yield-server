const sdk = require('@defillama/sdk');
const axios = require('axios');

const token = '0x04C154b66CB340F3Ae24111CC767e0184Ed00Cc6';
const weth = '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2';

const getApy = async () => {
  const tvl =
    (await sdk.api.erc20.totalSupply({ target: token })).output / 1e18;

  const apyData = (await axios.get('https://dineroismoney.com/api/apr')).data;
  const priceKey = `ethereum:${weth}`;
  const ethPrice = (
    await axios.get(`https://coins.llama.fi/prices/current/${priceKey}`)
  ).data.coins[priceKey]?.price;

  return [
    {
      pool: token,
      chain: 'ethereum',
      project: 'dinero-(pirex-eth)',
      symbol: 'apxeth',
      tvlUsd: tvl * ethPrice,
      apyBase: Number(apyData.apxEth),
      underlyingTokens: [weth],
    },
  ];
};

module.exports = {
  timetravel: false,
  apy: getApy,
  url: 'https://dineroismoney.com/pxeth/deposit',
};
