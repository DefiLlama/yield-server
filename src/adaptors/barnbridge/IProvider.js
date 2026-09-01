const sdk = require('@defillama/sdk');

const IProvider = require('./abis/IProvider.js');

exports.underlyingBalance = async (chain, target) =>
  (
    await sdk.api.abi.call({
      abi: IProvider.find((i) => i.name === 'underlyingBalance'),
      chain: chain.name,
      target: target,
    })
  ).output;

exports.totalUnRedeemed = async (chain, target) =>
  (
    await sdk.api.abi.call({
      abi: IProvider.find((i) => i.name === 'totalUnRedeemed'),
      chain: chain.name,
      target: target,
    })
  ).output;
