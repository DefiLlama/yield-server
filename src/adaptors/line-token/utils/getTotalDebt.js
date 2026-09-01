const sdk = require('@defillama/sdk');

const { LINE_CONTRACT_ADDRESS, CHAIN } = require('../config');

const LineAbi = require('../abi/lineAbi');

module.exports = async function getTotalDebt() {
  return (
    await sdk.api.abi.call({
      target: LINE_CONTRACT_ADDRESS,
      abi: LineAbi.find((m) => m.name === 'total_debt'),
      chain: CHAIN,
    })
  ).output;
};
