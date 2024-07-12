const sdk = require('@defillama/sdk');
const axios = require('axios');
const { ethers } = require('ethers');

const utils = require('../utils');
const { contracts, tokens } = require('./constants');

const apy = async () => {
  const underlying = tokens.MORE;
  const tokenPrices = (
    await axios.get(`https://coins.llama.fi/prices/current/real:${underlying}`)
  ).data.coins;

  const underlyingPrice = tokenPrices[`real:${underlying}`]?.price;

  const [tvlRes, decimalsRes] = await Promise.all(
    ['erc20:balanceOf', 'erc20:decimals'].map(
      async (method) =>
        await sdk.api.abi.multiCall({
          abi: method,
          calls: [
            {
              target: tokens.MORE,
              params: method === 'erc20:balanceOf' ? tokens.sMORE : null,
            },
          ],
          chain: 'real',
        })
    )
  );

  const [tvl] = tvlRes.output.map((o) => o.output);
  const [decimals] = decimalsRes.output.map((o) => o.output);

  const tvlUsd = (underlyingPrice * tvl) / 10 ** decimals;

  const tokensPerSecond = await sdk.api.abi.call({
    abi: contracts.FeeSplitter.abi.find(
      (m) => m.name === 'distributionRateFor'
    ),
    target: contracts.FeeSplitter.address,
    params: tokens.sMORE,
    chain: 'real',
  });

  const tokensPerYear = tokensPerSecond.output * 60 * 60 * 24 * 365;
  const apr = tokensPerYear / tvl;

  return [
    {
      pool: tokens.sMORE,
      chain: 'real',
      project: 'stack',
      symbol: utils.formatSymbol('sMORE'),
      tvlUsd,
      underlyingTokens: [tokens.MORE],
      apyBase: apr * 100,
      apyReward: 0,
      rewardTokens: null,
    },
  ];
};

module.exports = {
  timetravel: false,
  apy,
  url: 'https://www.stackmore.xyz/stake',
};
