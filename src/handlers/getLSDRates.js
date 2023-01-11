const sdk = require('@defillama/sdk');
const axios = require('axios');

module.exports.handler = async (event, context) => {
  context.callbackWaitsForEmptyEventLoop = false;
  return await getRates();
};

const getRates = async () => {
  const cbETHRateUrl =
    'https://api-public.sandbox.pro.coinbase.com/wrapped-assets/CBETH/conversion-rate';

  const cbETH = '0xbe9895146f7af43049ca1c1ae358b0541ea49704';
  const rETH = '0xae78736Cd615f374D3085123A210448E74Fc6393';
  const ankrETH = '0xe95a203b1a91a908f9b9ce46459d101078c2c3cb';

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

  return {
    [cbETH]: {
      name: 'Coinbase Wrapped Staked ETH',
      rate: cbETHRate,
    },
    [rETH]: { name: 'Rocket Pool', rate: rETHRate },
    [ankrETH]: { name: 'Ankr', rate: 1.0964 },
  };
};
