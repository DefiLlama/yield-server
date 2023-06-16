const sdk = require('@defillama/sdk');
const axios = require('axios');

const wbeth = '0xa2E3356610840701BDf5611a53974510Ae27E2e1';
const weth = '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2';
const project = 'binance-staked-eth';
const symbol = 'wbeth';

const apy = async () => {
  const tvlEthereum =
    (await sdk.api.erc20.totalSupply({ target: wbeth })).output / 1e18;

  const tvlBsc =
    (await sdk.api.erc20.totalSupply({ target: wbeth, chain: 'bsc' })).output /
    1e18;

  const priceKey = `ethereum:${weth}`;
  const ethPrice = (
    await axios.get(`https://coins.llama.fi/prices/current/${priceKey}`)
  ).data.coins[priceKey]?.price;

  const apr =
    (
      await axios.get(
        'https://www.binance.com/bapi/earn/v1/public/pos/cftoken/project/getPurchasableProject'
      )
    ).data.data.annualInterestRate * 100;

  return [
    {
      pool: `${wbeth}-ethereum`,
      chain: 'ethereum',
      project,
      symbol,
      underlyingTokens: [weth],
      apyBase: apr,
      tvlUsd: tvlEthereum * ethPrice,
    },
    {
      pool: `${wbeth}-bsc`,
      chain: 'bsc',
      project,
      symbol,
      underlyingTokens: [weth],
      apyBase: apr,
      tvlUsd: tvlBsc * ethPrice,
    },
  ];
};

module.exports = { apy, url: 'https://www.binance.com/en/eth2' };
