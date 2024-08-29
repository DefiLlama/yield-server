const axios = require('axios');
const sdk = require('@defillama/sdk');

const utils = require('../utils');
const abiLendingFactory = require('./abiLendingFactory');
const abiToken = require('./abiToken');
const abiLendingRewardsRateModel = require('./abiLendingRewardsRateModel');

const lendingFactory = '0x54B91A0D94cb471F37f949c60F7Fa7935b551D03';
const lendingRewardsRateModel_ = '0x2005617238a8E1C153D19A33fd32fB168f3626e7';

const apy = async () => {
  const allTokens = (
    await sdk.api.abi.call({
      target: lendingFactory,
      abi: abiLendingFactory.find((m) => m.name === 'allTokens'),
    })
  ).output;

  const underlying = (
    await sdk.api.abi.multiCall({
      calls: allTokens.map((t) => ({ target: t })),
      abi: abiToken.find((m) => m.name === 'asset'),
    })
  ).output.map((o) => o.output);

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

  const data = (
    await sdk.api.abi.multiCall({
      calls: allTokens.map((t) => ({ target: t })),
      abi: abiToken.find((m) => m.name === 'getData'),
    })
  ).output.map((o) => o.output);

  const totalAssets = (
    await sdk.api.abi.multiCall({
      calls: allTokens.map((t) => ({ target: t })),
      abi: abiToken.find((m) => m.name === 'totalAssets'),
    })
  ).output.map((o) => o.output);

  const totalSupply = (
    await sdk.api.abi.multiCall({
      calls: allTokens.map((t) => ({ target: t })),
      abi: abiToken.find((m) => m.name === 'totalSupply'),
    })
  ).output.map((o) => o.output);

  const priceKeys = underlying.map((i) => `ethereum:${i}`).join(',');
  const prices = (
    await axios.get(`https://coins.llama.fi/prices/current/${priceKeys}`)
  ).data.coins;

  const config = (
    await sdk.api.abi.multiCall({
      calls: data.map((d) => ({ target: d.lendingRewardsRateModel_ })),
      abi: abiLendingRewardsRateModel.find((m) => m.name === 'getConfig'),
      permitFailure: true,
    })
  ).output.map((o) => o.output);

  const rate = (
    await sdk.api.abi.multiCall({
      calls: data.map((d, i) => ({
        target: d.lendingRewardsRateModel_,
        params: totalAssets[i],
      })),
      abi: abiLendingRewardsRateModel.find((m) => m.name === 'getRate'),
      permitFailure: true,
    })
  ).output.map((o) => o.output);

  const pools = allTokens.map((token, i) => {
    const tokenPrice = prices[`ethereum:${underlying[i]}`].price;

    const totalSupplyUsd = (totalAssets[i] * tokenPrice) / 10 ** decimals[i];

    const apyBase =
      ((config[i]?.rewardAmount_ * 86400 * 365 * tokenPrice) /
        totalAssets[i] /
        10 ** decimals[i]) *
      100;

    // const apyBase = rate[i]?.rate_ / 1e12;

    return {
      project: 'fluid',
      chain: 'ethereum',
      pool: token,
      symbol: symbol[i],
      tvlUsd: totalSupplyUsd,
      apyBase,
      underlyingTokens: [underlying[i]],
    };
  });

  return pools.filter((i) => utils.keepFinite(i));
};

module.exports = {
  apy,
  url: 'https://fluid.instadapp.io/lending',
};
