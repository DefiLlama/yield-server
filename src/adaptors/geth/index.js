const sdk = require('@defillama/sdk');
const axios = require('axios');

const token = '0x3802c218221390025bceabbad5d8c59f40eb74b8';

const getApy = async () => {
  const tvl =
    (await sdk.api.erc20.totalSupply({ target: token })).output / 1e18;

  const apyData = (await axios.get('https://guarda.com/stake-api/eth2')).data;
  const priceKey = 'ethereum:0x0000000000000000000000000000000000000000';
  const ethPrice = (
    await axios.get(`https://coins.llama.fi/prices/current/${priceKey}`)
  ).data.coins[priceKey]?.price;

  return [
    {
      pool: token,
      chain: 'ethereum',
      project: 'geth',
      symbol: 'geth',
      tvlUsd: tvl * ethPrice,
      apyBase: Number(apyData.eth2.eth_interest.replace('%', '')),
      underlyingTokens: ['0x0000000000000000000000000000000000000000'],
      tokenAddress: token,
    },
  ];
};

module.exports = {
  timetravel: false,
  apy: getApy,
  url: 'https://guarda.com/staking/ethereum-staking/',
};
