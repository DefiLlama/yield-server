const { default: BigNumber } = require('bignumber.js');
const superagent = require('superagent');
const sdk = require('@defillama/sdk');
const HOUR = 60 * 60;
const DAY = 24 * HOUR;
const SECONDS_PER_YEAR = 365 * DAY;
const RAY_PRECISION = 27;
const RAY = new BigNumber(10).pow(RAY_PRECISION);

const WBNB = '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c';
const BUSD = '0xe9e7cea3dedca5984780bafc599bd69add087d56';
const ceaBNBcAddress = '0x563282106A5B0538f8673c787B3A16D3Cc1DbF1a';
const BNBJoin = '0xfA14F330711A2774eC438856BBCf2c9013c2a6a4';
const HAY = '0x0782b6d8c4551B9760e74c0545a9bCD90bdc41E5';
const hHAY = '0x0a1Fd12F73432928C190CAF0810b3B767A59717e';

const pool =
  '0x636541424e426300000000000000000000000000000000000000000000000000';
const JUG = {
  address: '0x787BdEaa29A253e40feB35026c3d05C18CbCA7B3',
  abis: {
    ilks: {
      inputs: [
        {
          internalType: 'bytes32',
          name: '',
          type: 'bytes32',
        },
      ],
      name: 'ilks',
      outputs: [
        {
          internalType: 'uint256',
          name: 'duty',
          type: 'uint256',
        },
        {
          internalType: 'uint256',
          name: 'rho',
          type: 'uint256',
        },
      ],
      stateMutability: 'view',
      type: 'function',
    },
  },
};

const SPOT = {
  address: '0x49bc2c4E5B035341b7d92Da4e6B267F7426F3038',
  abis: {
    ilks: {
      inputs: [
        {
          internalType: 'bytes32',
          name: '',
          type: 'bytes32',
        },
      ],
      name: 'ilks',
      outputs: [
        {
          internalType: 'contract PipLike',
          name: 'pip',
          type: 'address',
        },
        {
          internalType: 'uint256',
          name: 'mat',
          type: 'uint256',
        },
      ],
      stateMutability: 'view',
      type: 'function',
    },
  },
};

const JAR = {
  address: hHAY,
  abis: {
    rate: {
      inputs: [],
      name: 'rate',
      outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
      stateMutability: 'view',
      type: 'function',
    },
  },
};

const getApy = async () => {
  const baseRataCall = (
    await sdk.api.abi.call({
      target: JUG.address,
      params: pool,
      abi: JUG.abis.ilks,
      chain: 'bsc',
    })
  ).output;

  const spot = (
    await sdk.api.abi.call({
      target: SPOT.address,
      params: pool,
      abi: SPOT.abis.ilks,
      chain: 'bsc',
    })
  ).output;

  const hayTotalSupply = (
    await sdk.api.abi.call({
      target: HAY,
      abi: 'erc20:totalSupply',
      chain: 'bsc',
    })
  ).output;

  const hayRate = (
    await sdk.api.abi.call({
      target: hHAY,
      abi: JAR.abis.rate,
      chain: 'bsc',
    })
  ).output;

  const hHayTotalSupply = (
    await sdk.api.abi.call({
      target: hHAY,
      abi: 'erc20:totalSupply',
      chain: 'bsc',
    })
  ).output;

  const collateral = (
    await sdk.api.abi.call({
      target: ceaBNBcAddress,
      abi: 'erc20:balanceOf',
      params: [BNBJoin],
      chain: 'bsc',
    })
  ).output;

  const coins = [`bsc:${HAY}`, `bsc:${WBNB}`].join(',').toLowerCase();

  const prices = (
    await superagent.get(`https://coins.llama.fi/prices/current/${coins}`)
  ).body.coins;

  const baseRata = baseRataCall.duty;
  const normalizRate = new BigNumber(baseRata).dividedBy(RAY);
  BigNumber.config({ POW_PRECISION: 100 });
  const stabilityFee = normalizRate.pow(SECONDS_PER_YEAR).minus(1);
  const totalSupplyUsd =
    (Number(hayTotalSupply) / 1e18) * prices[`bsc:${HAY.toLowerCase()}`].price;
  const liquidationRatio = new BigNumber(spot.mat).div(1e27);
  return [
    {
      pool: ceaBNBcAddress,
      project: 'lisusd',
      symbol: 'BNB',
      chain: 'binance',
      apy: 0,
      tvlUsd:
        (Number(collateral) / 1e18) * prices[`bsc:${WBNB.toLowerCase()}`].price,
      apyBaseBorrow: stabilityFee.toNumber() * 100,
      totalSupplyUsd:
        (Number(collateral) / 1e18) * prices[`bsc:${WBNB.toLowerCase()}`].price,
      totalBorrowUsd: totalSupplyUsd,
      ltv: 1 / Number(liquidationRatio.toNumber()),
      mintedCoin: 'HAY',
    },
    {
      pool: hHAY,
      project: 'lisusd',
      symbol: 'HAY',
      chain: 'binance',
      apy: new BigNumber(hayRate)
        .times(SECONDS_PER_YEAR)
        .div(hHayTotalSupply)
        .times(100)
        .toNumber(),
      tvlUsd:
        (Number(hHayTotalSupply) / 1e18) *
        prices[`bsc:${HAY.toLowerCase()}`].price,
    },
  ];
};

module.exports = {
  timetravel: false,
  apy: getApy,
  url: 'https://helio.money/',
};
