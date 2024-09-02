const sdk = require('@defillama/sdk');

const oracleAbi = require('../abi/oracleAbi');
const lineAbi = require('../abi/lineAbi');

const { LINE_CONTRACT_ADDRESS, CHAIN } = require('../config');

module.exports = async function getCurrentLinePrice() {
  return (
    await sdk.api.abi
      .call({
        target: LINE_CONTRACT_ADDRESS,
        abi: lineAbi.find((m) => m.name === 'oracle'),
        chain: CHAIN,
      })
      .then(({ output: oracle }) => {
        return sdk.api.abi.call({
          target: oracle,
          abi: oracleAbi.find((m) => m.name === 'getCurrentPrice'),
          chain: CHAIN,
        });
      })
  ).output;
};
