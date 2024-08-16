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
    symbol: 'osETH',
    address: '0xf1C9acDc66974dFB6dEcB12aA385b9cD01190E38',
    type: a,
    fee: 0.05,
  },
  {
    name: 'Ankr',
    symbol: 'ANKRETH',
    address: '0xe95a203b1a91a908f9b9ce46459d101078c2c3cb',
    type: a,
    fee: 0.1,
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
    address: '0x4Bc3263Eb5bb2Ef7Ad9aB6FB68be80E43b43801F', // vETH
    addressExchangeRate: '0x74bAA141B18D5D1eeF1591abf37167FbeCE23B72', // Staking Liquidity Protocol Contract
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
    name: 'Swell Liquid Staking',
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
    address: '0x93ef1Ea305D11A9b2a3EbB9bB4FCc34695292E7d', // qETH
    addressExchangeRate: '0xA6aeD7922366611953546014A3f9e93f058756a2', // QueenRateProvider
    type: a,
    // fee: 0.1,
  },
  {
    name: 'Stakehouse',
    symbol: 'dETH',
    address: '0x3d1e5cf16077f349e999d6b21a4f646e83cd90c5',
    type: a,
    fee: 0,
  },
  {
    name: 'Stader',
    symbol: 'ETHx',
    address: '0xA35b1B31Ce002FBF2058D22F30f95D405200A15b',
    addressExchangeRate: '0xcf5EA1b38380f6aF39068375516Daf40Ed70D299',
    type: a,
    fee: 0.1,
  },
  {
    name: 'NodeDAO',
    symbol: 'nETH',
    address: '0xC6572019548dfeBA782bA5a2093C836626C7789A',
    addressExchangeRate: '0x8103151E2377e78C04a3d2564e20542680ed3096',
    type: a,
    fee: 0.1,
  },
  {
    name: 'Bedrock uniETH',
    symbol: 'uniETH',
    address: '0xF1376bceF0f78459C0Ed0ba5ddce976F1ddF51F4',
    addressExchangeRate: '0x4beFa2aA9c305238AA3E0b5D17eB20C045269E9d',
    type: a,
    fee: 0.1,
  },
  {
    name: 'Mantle Staked ETH',
    symbol: 'mETH',
    address: '0xd5F7838F5C461fefF7FE49ea5ebaF7728bB0ADfa',
    addressExchangeRate: '0xe3cBd06D7dadB3F4e6557bAb7EdD924CD1489E8f',
    type: a,
    fee: 0.1,
  },
  {
    name: 'Dinero (Pirex ETH)',
    symbol: 'APXETH',
    address: '0x04c154b66cb340f3ae24111cc767e0184ed00cc6',
    type: a,
    fee: 0.1,
  },
  {
    name: 'Liquid Collective',
    symbol: 'lsETH',
    address: '0x8c1bed5b9a0928467c9b1341da1d7bd5e10b6549',
    type: a,
    fee: 0.1,
  },
  {
    name: 'MEV Protocol',
    symbol: 'mevETH',
    address: '0x24Ae2dA0f361AA4BE46b48EB19C91e02c5e4f27E',
    type: a,
    fee: 0.1,
  },
  {
    name: 'Meta Pool ETH',
    symbol: 'mpETH',
    address: '0x48AFbBd342F64EF8a9Ab1C143719b63C2AD81710',
    type: a,
    fee: 0.1,
  },
  {
    name: 'Crypto.com Staked ETH',
    symbol: 'CDCETH',
    address: '0x7a7c9db510aB29A2FC362a4c34260BEcB5cE3446',
    type: a,
    fee: 0.1,
  },
];

const priceUrl = 'https://aggregator-api.kyberswap.com/ethereum/api/v1/routes';
const cbETHRateUrl =
  'https://api-public.sandbox.pro.coinbase.com/wrapped-assets/CBETH/conversion-rate';

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
  const amount = 1e18;
  const urls = lsdTokens
    .filter((i) => i.name !== 'StakeHound') // useless data
    .map(
      (lsd) =>
        `${priceUrl}?tokenIn=${lsd.address}&tokenOut=0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE&amountIn=${amount}`
    );

  const marketRates = [];
  for (const url of urls) {
    try {
      marketRates.push((await axios.get(url)).data.data.routeSummary);
      await sleep(500);
    } catch (err) {
      console.log(url, err.response.data);
    }
  }

  return marketRates.map((m) => ({
    buyTokenAddress: m.tokenOut,
    sellTokenAddress: m.tokenIn,
    buyAmount: m.amountOut,
    sellAmount: m.amountIn,
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

  const uniETHAbi = {
    inputs: [],
    name: 'exchangeRatio',
    outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  };

  const mETHAbi = {
    inputs: [{ internalType: 'uint256', name: 'mETHAmount', type: 'uint256' }],
    name: 'mETHToETH',
    outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  };

  const lsETHAbi = {
    inputs: [
      {
        internalType: 'uint256',
        name: '_underlyingAssetAmount',
        type: 'uint256',
      },
    ],
    name: 'sharesFromUnderlyingBalance',
    outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  };

  const mevETHAbi = {
    inputs: [],
    name: 'fraction',
    outputs: [
      { internalType: 'uint128', name: 'elastic', type: 'uint128' },
      { internalType: 'uint128', name: 'base', type: 'uint128' },
    ],
    stateMutability: 'view',
    type: 'function',
  };

  const mpETHAbi = {
    inputs: [{ internalType: 'uint256', name: 'shares', type: 'uint256' }],
    name: 'convertToAssets',
    outputs: [{ internalType: 'uint256', name: 'assets', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  };

  const CDCETHAbi = {
    inputs: [],
    name: 'exchangeRate',
    outputs: [
      { internalType: 'uint256', name: '_exchangeRate', type: 'uint256' },
    ],
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
        target: lsdTokens.find((lsd) => lsd.name === 'Swell Liquid Staking')
          .address,
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
        target: lsdTokens.find((lsd) => lsd.name === 'Tranchess Ether')
          .addressExchangeRate,
        chain: 'ethereum',
        abi: qETHAbi,
      })
    ).output / 1e18;

  const vETH =
    (
      await sdk.api.abi.call({
        target: lsdTokens.find((lsd) => lsd.name === 'Bifrost Liquid Staking')
          .addressExchangeRate,
        chain: 'ethereum',
        abi: vETHAbi,
        params: [BigInt(1e18)],
      })
    ).output / 1e18;

  const ETHx =
    (
      await sdk.api.abi.call({
        target: lsdTokens.find((lsd) => lsd.name === 'Stader')
          .addressExchangeRate,
        chain: 'ethereum',
        abi: ETHxAbi,
      })
    ).output / 1e18;

  const nETH =
    (
      await sdk.api.abi.call({
        target: lsdTokens.find((lsd) => lsd.name === 'NodeDAO')
          .addressExchangeRate,
        chain: 'ethereum',
        abi: nETHAbi,
      })
    ).output / 1e18;

  const uniETH =
    (
      await sdk.api.abi.call({
        target: lsdTokens.find((lsd) => lsd.name === 'Bedrock uniETH')
          .addressExchangeRate,
        chain: 'ethereum',
        abi: uniETHAbi,
      })
    ).output / 1e18;

  const mETH =
    (
      await sdk.api.abi.call({
        target: lsdTokens.find((lsd) => lsd.name === 'Mantle Staked ETH')
          .addressExchangeRate,
        chain: 'ethereum',
        abi: mETHAbi,
        params: [1000000000000000000n],
      })
    ).output / 1e18;

  const lsETH =
    10000 /
    (
      await sdk.api.abi.call({
        target: lsdTokens.find((lsd) => lsd.name === 'Liquid Collective')
          .address,
        chain: 'ethereum',
        abi: lsETHAbi,
        params: [10000],
      })
    ).output;

  const mevETHRes = (
    await sdk.api.abi.call({
      target: lsdTokens.find((lsd) => lsd.name === 'MEV Protocol').address,
      chain: 'ethereum',
      abi: mevETHAbi,
    })
  ).output;
  const mevETH = mevETHRes[0] / mevETHRes[1];

  const mpETH =
    (
      await sdk.api.abi.call({
        target: lsdTokens.find((lsd) => lsd.name === 'Meta Pool ETH').address,
        chain: 'ethereum',
        params: [1000000000000000000n],
        abi: mpETHAbi,
      })
    ).output / 1e18;

  const CDCETH =
    (
      await sdk.api.abi.call({
        target: lsdTokens.find((lsd) => lsd.name === 'Crypto.com Staked ETH')
          .address,
        chain: 'cronos',
        abi: CDCETHAbi,
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
        : lsd.name === 'Swell Liquid Staking'
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
        : lsd.name === 'NodeDAO'
        ? nETH
        : lsd.name === 'Bedrock uniETH'
        ? uniETH
        : lsd.name === 'Mantle Staked ETH'
        ? mETH
        : lsd.name === 'Liquid Collective'
        ? lsETH
        : lsd.name === 'MEV Protocol'
        ? mevETH
        : lsd.name === 'Meta Pool ETH'
        ? mpETH
        : lsd.name === 'Crypto.com Staked ETH'
        ? CDCETH
        : 1,
  }));
};
