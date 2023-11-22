const sdk = require('@defillama/sdk');
const axios = require('axios');

const { insertLsd } = require('../queries/lsd');

module.exports.handler = async (event, context) => {
  context.callbackWaitsForEmptyEventLoop = false;
  const payload = await getRates();
  const response = await insertLsd(payload);
  console.log(response);
};

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const r = 'rebase';
const a = 'accruing';

// name field must match `name` in our protocols endpoint
const lsdTokens = [
  {
    name: 'Lido',
    symbol: 'stETH',
    address: '0xae7ab96520de3a18e5e111b5eaab095312d7fe84',
    type: r,
    fee: 0.1,
  },
  {
    name: 'Coinbase Wrapped Staked ETH',
    symbol: 'cbETH',
    address: '0xbe9895146f7af43049ca1c1ae358b0541ea49704',
    type: a,
    fee: 0.25,
  },
  {
    name: 'Rocket Pool',
    symbol: 'rETH',
    address: '0xae78736cd615f374d3085123a210448e74fc6393',
    type: a,
    fee: 0.14,
  },
  {
    name: 'StakeWise',
    symbol: 'sETH2',
    address: '0xfe2e637202056d30016725477c5da089ab0a043a',
    type: r,
    fee: 0.1,
  },
  {
    name: 'Ankr',
    symbol: 'ANKRETH',
    address: '0xe95a203b1a91a908f9b9ce46459d101078c2c3cb',
    type: a,
  },
  {
    name: 'Frax Ether',
    symbol: 'sfrxETH',
    address: '0xac3e018457b222d93114458476f3e3416abbe38f',
    type: a,
    fee: 0.1,
  },
  {
    name: 'SharedStake',
    symbol: 'vETH2',
    address: '0x898bad2774eb97cf6b94605677f43b41871410b1',
    fee: 0.06,
  },
  {
    name: 'Stafi',
    symbol: 'rETH',
    address: '0x9559aaa82d9649c7a7b220e7c461d2e74c9a3593',
    type: a,
    fee: 0.1,
  },
  {
    name: 'StakeHound',
    symbol: 'stETH',
    address: '0xdfe66b14d37c77f4e9b180ceb433d1b164f0281d',
  },
  {
    name: 'Bifrost Liquid Staking',
    symbol: 'vETH',
    // address: '0x4Bc3263Eb5bb2Ef7Ad9aB6FB68be80E43b43801F', // vETH
    address: '0x74bAA141B18D5D1eeF1591abf37167FbeCE23B72', // Staking Liquidity Protocol Contract
    type: a,
  },
  {
    name: 'GETH',
    symbol: 'GETH',
    address: '0x3802c218221390025bceabbad5d8c59f40eb74b8',
    type: r,
    fee: 0.1,
  },
  {
    name: 'Hord',
    symbol: 'hETH',
    address: '0x5bBe36152d3CD3eB7183A82470b39b29EedF068B',
    type: a,
    fee: 0.1,
  },
  {
    name: 'Swell',
    symbol: 'swETH',
    address: '0xf951E335afb289353dc249e82926178EaC7DEd78',
    type: a,
    fee: 0.1,
  },
  {
    name: 'Binance staked ETH',
    symbol: 'wBETH',
    address: '0xa2E3356610840701BDf5611a53974510Ae27E2e1',
    type: a,
    fee: 0.1,
  },
  {
    name: 'Tranchess Ether',
    symbol: 'qETH',
    // address: '0x93ef1Ea305D11A9b2a3EbB9bB4FCc34695292E7d', // qETH
    address: '0xA6aeD7922366611953546014A3f9e93f058756a2', // QueenRateProvider
    type: a,
    // fee: 0.1,
  },
  {
    name: 'Stakehouse',
    symbol: 'dETH',
    address: '0x3d1e5cf16077f349e999d6b21a4f646e83cd90c5',
    type: r,
    fee: 0,
  },
  {
    name: 'Stader',
    symbol: 'ETHx',
    address: '0xcf5EA1b38380f6aF39068375516Daf40Ed70D299',
    type: a,
    fee: 0.1,
  },
  {
    name: 'NodeDAO',
    symbol: 'nETH',
    // address: '0xC6572019548dfeBA782bA5a2093C836626C7789A',
    address: '0x8103151E2377e78C04a3d2564e20542680ed3096',
    type: a,
    fee: 0.1,
  },
];

const priceUrl = 'https://api.0x.org/swap/v1/quote';
const cbETHRateUrl =
  'https://api-public.sandbox.pro.coinbase.com/wrapped-assets/CBETH/conversion-rate';

const apiKey = {
  headers: { '0x-api-key': process.env.ZEROX_API },
};

const getRates = async () => {
  const marketRates = await getMarketRates();
  const expectedRates = await getExpectedRates();

  const timestamp = new Date();
  const payload = expectedRates.map((p) => {
    const marketRate =
      marketRates.find(
        (mr) => mr.sellTokenAddress.toLowerCase() === p.address.toLowerCase()
      )?.buyAmount / 1e18;
    const ethPeg = (marketRate / p.expectedRate - 1) * 100;

    return {
      ...p,
      marketRate: Number.isFinite(marketRate) ? marketRate : null,
      ethPeg: Number.isFinite(ethPeg) ? ethPeg : null,
      timestamp,
    };
  });

  return payload;
};

const getMarketRates = async () => {
  const eth = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE';
  const amount = 1e18;
  const urls = lsdTokens
    .filter((i) => i.name !== 'StakeHound') // useless data
    .map(
      (lsd) =>
        `${priceUrl}?sellToken=${lsd.address}&buyToken=${eth}&sellAmount=${amount}`
    );

  const marketRates = [];
  for (const url of urls) {
    try {
      marketRates.push((await axios.get(url, apiKey)).data);
      await sleep(500);
    } catch (err) {
      console.log(url, err.response.data);
    }
  }

  return marketRates.map((m) => ({
    buyTokenAddress: m.buyTokenAddress,
    sellTokenAddress: m.sellTokenAddress,
    buyAmount: m.buyAmount,
    sellAmount: m.sellAmount,
  }));
};

const getExpectedRates = async () => {
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

  const sfrxETHAbi = {
    inputs: [],
    name: 'pricePerShare',
    outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  };

  const swETHAbi = {
    inputs: [],
    name: 'getRate',
    outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  };

  const wBETHAbi = {
    inputs: [],
    name: 'exchangeRate',
    outputs: [
      { internalType: 'uint256', name: '_exchangeRate', type: 'uint256' },
    ],
    stateMutability: 'view',
    type: 'function',
  };

  const hETHAbi = [
    {
      inputs: [],
      name: 'lastExecLayerRewardsForFeeCalc',
      outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
      stateMutability: 'view',
      type: 'function',
    },
    {
      inputs: [
        { internalType: 'uint256', name: 'amountETH', type: 'uint256' },
        { internalType: 'bool', name: 'isContractCall', type: 'bool' },
        {
          internalType: 'uint256',
          name: 'diffExecLayerRewardsForFeelCalc',
          type: 'uint256',
        },
      ],
      name: 'getAmountOfHETHforETH',
      outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
      stateMutability: 'view',
      type: 'function',
    },
  ];

  const qETHAbi = {
    inputs: [],
    name: 'getRate',
    outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  };

  const vETHAbi = {
    inputs: [
      { internalType: 'uint256', name: 'vTokenAmount', type: 'uint256' },
    ],
    name: 'calculateTokenAmount',
    outputs: [
      { internalType: 'uint256', name: 'tokenAmount', type: 'uint256' },
    ],
    stateMutability: 'view',
    type: 'function',
  };

  const ETHxAbi = {
    inputs: [],
    name: 'getExchangeRate',
    outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  };

  const nETHAbi = {
    inputs: [],
    name: 'getExchangeRate',
    outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  };

  // --- cbETH
  const cbETHRate = Number((await axios.get(cbETHRateUrl)).data.amount);

  // --- rETH (rocket pool)
  const rETHRate =
    (
      await sdk.api.abi.call({
        target: lsdTokens.find((lsd) => lsd.name === 'Rocket Pool').address,
        chain: 'ethereum',
        abi: rETHAbi,
      })
    ).output / 1e18;

  // --- rETH (stafi)
  const rETHStafiRate =
    (
      await sdk.api.abi.call({
        target: lsdTokens.find((lsd) => lsd.name === 'Stafi').address,
        chain: 'ethereum',
        abi: rETHAbi,
      })
    ).output / 1e18;

  // --- ankrETH
  const ankrETHRate =
    1 /
    ((
      await sdk.api.abi.call({
        target: lsdTokens.find((lsd) => lsd.name === 'Ankr').address,
        chain: 'ethereum',
        abi: ankrETHAbi,
      })
    ).output /
      1e18);

  // --- sfrxETH
  const sfrxETH =
    (
      await sdk.api.abi.call({
        target: lsdTokens.find((lsd) => lsd.name === 'Frax Ether').address,
        chain: 'ethereum',
        abi: sfrxETHAbi,
      })
    ).output / 1e18;

  // --- swETH
  const swETH =
    (
      await sdk.api.abi.call({
        target: lsdTokens.find((lsd) => lsd.name === 'Swell').address,
        chain: 'ethereum',
        abi: swETHAbi,
      })
    ).output / 1e18;

  const wBETH =
    (
      await sdk.api.abi.call({
        target: lsdTokens.find((lsd) => lsd.name === 'Binance staked ETH')
          .address,
        chain: 'ethereum',
        abi: wBETHAbi,
      })
    ).output / 1e18;

  const hETHlastExecLayerRewardsForFeeCalc = (
    await sdk.api.abi.call({
      target: lsdTokens.find((lsd) => lsd.name === 'Hord').address,
      chain: 'ethereum',
      abi: hETHAbi[0],
    })
  ).output;

  const hETH =
    1 /
    ((
      await sdk.api.abi.call({
        target: lsdTokens.find((lsd) => lsd.name === 'Hord').address,
        chain: 'ethereum',
        abi: hETHAbi[1],
        params: [
          BigInt(1e18),
          false,
          BigInt(hETHlastExecLayerRewardsForFeeCalc),
        ],
      })
    ).output /
      1e18);

  const qETH =
    (
      await sdk.api.abi.call({
        target: lsdTokens.find((lsd) => lsd.name === 'Tranchess Ether').address,
        chain: 'ethereum',
        abi: qETHAbi,
      })
    ).output / 1e18;

  const vETH =
    (
      await sdk.api.abi.call({
        target: lsdTokens.find((lsd) => lsd.name === 'Bifrost Liquid Staking')
          .address,
        chain: 'ethereum',
        abi: vETHAbi,
        params: [BigInt(1e18)],
      })
    ).output / 1e18;

  const ETHx =
    (
      await sdk.api.abi.call({
        target: lsdTokens.find((lsd) => lsd.name === 'Stader').address,
        chain: 'ethereum',
        abi: ETHxAbi,
      })
    ).output / 1e18;

  const nETH =
    (
      await sdk.api.abi.call({
        target: lsdTokens.find((lsd) => lsd.name === 'NodeDAO').address,
        chain: 'ethereum',
        abi: nETHAbi,
      })
    ).output / 1e18;

  return lsdTokens.map((lsd) => ({
    ...lsd,
    expectedRate:
      lsd.name === 'Coinbase Wrapped Staked ETH'
        ? cbETHRate
        : lsd.name === 'Rocket Pool'
        ? rETHRate
        : lsd.name === 'Stafi'
        ? rETHStafiRate
        : lsd.name === 'Ankr'
        ? ankrETHRate
        : lsd.name === 'Frax Ether'
        ? sfrxETH
        : lsd.name === 'Swell'
        ? swETH
        : lsd.name === 'Binance staked ETH'
        ? wBETH
        : lsd.name === 'Hord'
        ? hETH
        : lsd.name === 'Tranchess Ether'
        ? qETH
        : lsd.name === 'Bifrost Liquid Staking'
        ? vETH
        : lsd.name === 'Stader'
        ? ETHx
        : lsd.name === 'NodeDao'
        ? nETH
        : 1,
  }));
};
