const sdk = require('@defillama/sdk');

module.exports.makeMulticall = async ({ abi, calls, chain }) => {
  const data = await sdk.api.abi.multiCall({
    abi,
    calls,
    chain,
  });

  const res = data.output.map(({ output }) => output);

  return res;
};

exports.aprToApy = (apr, compoundFrequency = 365) => {
  return (1 + apr / compoundFrequency) ** compoundFrequency - 1;
};
