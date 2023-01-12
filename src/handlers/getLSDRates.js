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
  const rETHStafi = '0x9559Aaa82d9649C7A7b220E7c461d2E74c9a3593';

  // same for rETHStafi
  const rETHAbi = {
    inputs: [],
    name: 'getExchangeRate',
    outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  };

  const ankrETHAbi = {
    inputs: [],
    name: 'ratio',
    outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  };

  // --- cbETH
  const cbETHRate = Number((await axios.get(cbETHRateUrl)).data.amount);

  // --- rETH (rocket pool)
  const rETHRate =
    (await sdk.api.abi.call({ target: rETH, chain: 'ethereum', abi: rETHAbi }))
      .output / 1e18;

  // --- rETH (stafi)
  const rETHStafiRate =
    (
      await sdk.api.abi.call({
        target: rETHStafi,
        chain: 'ethereum',
        abi: rETHAbi,
      })
    ).output / 1e18;

  // --- ankrETH
  const ankrETHRate =
    1 /
    ((
      await sdk.api.abi.call({
        target: ankrETH,
        chain: 'ethereum',
        abi: ankrETHAbi,
      })
    ).output /
      1e18);

  return [
    {
      address: cbETH,
      name: 'Coinbase Wrapped Staked ETH',
      rate: cbETHRate,
    },
    { address: rETH, name: 'Rocket Pool', rate: rETHRate },
    { address: rETHStafi, name: 'Stafi', rate: rETHStafiRate },
    { address: ankrETH, name: 'Ankr', rate: ankrETHRate },
  ];
};
