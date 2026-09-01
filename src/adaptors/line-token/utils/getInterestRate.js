const sdk = require('@defillama/sdk');

const { LINE_CONTRACT_ADDRESS, CHAIN } = require('../config');

const lineAbi = require('../abi/lineAbi');

module.exports = async function getInterestRate() {
  return (
    await sdk.api.abi.call({
      target: LINE_CONTRACT_ADDRESS,
      abi: lineAbi.find((m) => m.name === 'interest_rate10000'),
      chain: CHAIN,
    })
  ).output;
};
