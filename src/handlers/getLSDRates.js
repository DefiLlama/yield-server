const sdk = require('@defillama/sdk');
const axios = require('axios');

module.exports.handler = async (event, context) => {
  context.callbackWaitsForEmptyEventLoop = false;
  return await getRates();
};

const getRates = async () => {
  const cbETHRateUrl =
    'https://api-public.sandbox.pro.coinbase.com/wrapped-assets/CBETH/conversion-rate';
  const rETH = '0xae78736Cd615f374D3085123A210448E74Fc6393';

  const rETHAbi = {
    inputs: [],
    name: 'getExchangeRate',
    outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  };

  const cbETHRate = Number((await axios.get(cbETHRateUrl)).data.amount);
  const rETHRate =
    (await sdk.api.abi.call({ target: rETH, chain: 'ethereum', abi: rETHAbi }))
      .output / 1e18;

  return { cbETHRate, rETHRate };
};
