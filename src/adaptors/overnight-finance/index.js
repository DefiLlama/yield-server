const sdk = require('@defillama/sdk');
const axios = require('axios');
const utils = require('../utils');
const { ethers } = require('ethers');

const xUSD = '0xe80772Eaf6e2E18B651F160Bc9158b2A5caFCA65';

const eventAbi = [
  {
    anonymous: false,
    inputs: [
      {
        indexed: false,
        internalType: 'uint256',
        name: 'profit',
        type: 'uint256',
      },
      {
        indexed: false,
        internalType: 'uint256',
        name: 'newLiquidityIndex',
        type: 'uint256',
      },
      {
        indexed: false,
        internalType: 'uint256',
        name: 'excessProfit',
        type: 'uint256',
      },
      {
        indexed: false,
        internalType: 'uint256',
        name: 'insurancePremium',
        type: 'uint256',
      },
      {
        indexed: false,
        internalType: 'uint256',
        name: 'insuranceLoss',
        type: 'uint256',
      },
    ],
    name: 'PayoutEvent',
    type: 'event',
  },
];

const apy = async () => {
  const totalSupply =
    (
      await sdk.api.abi.call({
        target: xUSD,
        abi: 'erc20:totalSupply',
        chain: 'arbitrum',
      })
    ).output / 1e6;

  const priceKey = `arbitrum:${xUSD}`;
  const price = (
    await axios.get(`https://coins.llama.fi/prices/current/${priceKey}`)
  ).data.coins[priceKey].price;

  const tvlUsd = totalSupply * price;

  const currentBlock = await sdk.api.util.getLatestBlock('arbitrum');
  const toBlock = currentBlock.number;
  const topic =
    '0x8dd3783ac3ed2cabfce0fa4347c2cab93b8273171a7e30b28a83147b099c4038';
  const logs = (
    await sdk.api2.util.getLogs({
      target: '0x73cb180bf0521828d8849bc8CF2B920918e23032',
      topic: '',
      toBlock,
      fromBlock: 63102109,
      keys: [],
      topics: [topic],
      chain: 'arbitrum',
    })
  ).output.sort((a, b) => b.blockNumber - a.blockNumber);

  const iface = new ethers.utils.Interface(eventAbi);
  const decoded = iface.parseLog(logs[0]);
  const rewardsReceived = parseInt(decoded.args.profit / 1e6);
  const aprBase = ((rewardsReceived * 365) / tvlUsd) * 100;
  // weekly compoounding
  const apyBase = utils.aprToApy(aprBase, 365);
  return [
    {
      pool: xUSD,
      symbol: 'xUSD',
      project: 'overnight-finance',
      chain: 'arbitrum',
      tvlUsd,
      apyBase,
    },
  ];
};

module.exports = {
  apy,
  url: 'https://app.overnight.fi/',
};
