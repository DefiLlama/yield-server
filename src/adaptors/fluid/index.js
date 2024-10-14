const axios = require('axios');
const sdk = require('@defillama/sdk');

const utils = require('../utils');

const abiLendingResolver = require('./abiLendingResolver');
const lendingResolver = '0xC215485C572365AE87f908ad35233EC2572A3BEC'

const apy = async () => {
  const fTokensEntireData = (
    await sdk.api.abi.call({
      target: lendingResolver,
      abi: abiLendingResolver.find((m) => m.name === 'getFTokensEntireData'),
    })
  ).output;

  const underlying = fTokensEntireData.map((d) => d.asset);

  const symbol = (
    await sdk.api.abi.multiCall({
      calls: underlying.map((t) => ({ target: t })),
      abi: 'erc20:symbol',
    })
  ).output.map((o) => o.output);

  const decimals = (
    await sdk.api.abi.multiCall({
      calls: underlying.map((t) => ({ target: t })),
      abi: 'erc20:decimals',
    })
  ).output.map((o) => o.output);

  const priceKeys = underlying.map((i) => `ethereum:${i}`).join(',');
  const prices = (
    await axios.get(`https://coins.llama.fi/prices/current/${priceKeys}`)
  ).data.coins;

  const pools = fTokensEntireData.map((token, i) => {
    const tokenAddress = token.tokenAddress
    const underlyingToken = token.asset
    const decimals = token.decimals
    const tokenPrice = prices[`ethereum:${underlying[i]}`].price;

    const totalSupplyUsd = (token.totalAssets * tokenPrice) / 10 ** decimals;

    const apyBase = token.supplyRate;
    const apyReward = token.rewardsRate / 1e10;

    return {
      project: 'fluid',
      chain: 'ethereum',
      pool: token,
      symbol: symbol[i],
      tvlUsd: totalSupplyUsd,
      apyBase,
      apyReward,
      underlyingTokens: [underlyingToken],
    };
  });

  return pools.filter((i) => utils.keepFinite(i));
};

module.exports = {
  apy,
  url: 'https://fluid.instadapp.io/lending',
};
