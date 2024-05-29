const axios = require('axios');
const sdk = require('@defillama/sdk5');

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

  const config = (
    await sdk.api.abi.multiCall({
      calls: data.map((d) => ({ target: d.lendingRewardsRateModel_ })),
      abi: abiLendingRewardsRateModel.find((m) => m.name === 'getConfig'),
      permitFailure: true,
    })
  ).output.map((o) => o.output);
};

module.exports = {
  apy,
  url: 'https://fluid.instadapp.io/lending',
};
