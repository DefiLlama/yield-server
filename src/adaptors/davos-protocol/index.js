const { default: BigNumber } = require('bignumber.js');
const superagent = require('superagent');
const sdk = require('@defillama/sdk');
const HOUR = 60 * 60;
const DAY = 24 * HOUR;
const SECONDS_PER_YEAR = 365 * DAY;
const RAY_PRECISION = 27;
const RAY = new BigNumber(10).pow(RAY_PRECISION);

const WMATIC = '0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270';
const ANKRMATIC = `0x0E9b89007eEE9c958c0EDA24eF70723C2C93dD58`
const ceaaMATICcAddress = '0xa6aE8F29e0031340eA5dBE11c2DA4466cDe34464';
const DAVOSJoin = '0x8FCD9542a6Ee0F05f470230da5B8cB41033da6Df';
const DAVOS = '0xEC38621e72D86775a89C7422746de1f52bbA5320';
const sDAVOS = '0xE69a1876bdACfa7A7a4F6D531BE2FDE843D2165C';

const pool =
  '0x63654d4154494300000000000000000000000000000000000000000000000000';
const JUG = {
  address: '0xc5a7344461EEc05e174aa8AC4e4030b24aA02EBD',
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
  address: '0xF97680e99Be42daCCEA9fe6f9F9aa385ccf97a62',
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
  address: sDAVOS,
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
      chain: 'polygon',
    })
  ).output;

  const spot = (
    await sdk.api.abi.call({
      target: SPOT.address,
      params: pool,
      abi: SPOT.abis.ilks,
      chain: 'polygon',
    })
  ).output;

  const davosTotalSupply = (
    await sdk.api.abi.call({
      target: DAVOS,
      abi: 'erc20:totalSupply',
      chain: 'polygon',
    })
  ).output;

  const davosRate = (
    await sdk.api.abi.call({
      target: sDAVOS,
      abi: JAR.abis.rate,
      chain: 'polygon',
    })
  ).output;

  const dMATICTotalSupply = (
    await sdk.api.abi.call({
      target: sDAVOS,
      abi: 'erc20:totalSupply',
      chain: 'polygon',
    })
  ).output;

  const collateral = (
    await sdk.api.abi.call({
      target: ceaaMATICcAddress,
      abi: 'erc20:balanceOf',
      params: ["0x29Ded4C99690968562f2D067968aA72b7d46A65D"],
      chain: 'polygon',
    })
  ).output;

  const prices = (
    await superagent.post('https://coins.llama.fi/prices').send({
      coins: [`polygon:${DAVOS}`, `polygon:${WMATIC}`, `polygon:${ANKRMATIC}`],
    })
  ).body.coins;

  const baseRata = baseRataCall.duty;
  const normalizRate = new BigNumber(baseRata).dividedBy(RAY);
  BigNumber.config({ POW_PRECISION: 100 });
  const stabilityFee = normalizRate.pow(SECONDS_PER_YEAR).minus(1);
  const totalSupplyUsd =
    (Number(davosTotalSupply) / 1e18) * prices[`polygon:${DAVOS.toLowerCase()}`].price;
  const liquidationRatio = new BigNumber(spot.mat).div(1e27);
  return [
    {
      pool: ceaaMATICcAddress,
      project: 'davos-protocol',
      symbol: 'MATIC',
      chain: 'polygon',
      apy: 0,
      tvlUsd:
        (Number(collateral) / 1e18) * prices[`polygon:${WMATIC.toLowerCase()}`].price,
      apyBaseBorrow: stabilityFee.toNumber() * 100,
      totalSupplyUsd:
        (Number(collateral) / 1e18) * prices[`polygon:${WMATIC.toLowerCase()}`].price,
      totalBorrowUsd: totalSupplyUsd,
      ltv: 1 / Number(liquidationRatio.toNumber()),
      mintedCoin: 'DAVOS',
    },
    {
      pool: sDAVOS,
      project: 'davos-protocol',
      symbol: 'DAVOS',
      chain: 'polygon',
      apy: new BigNumber(davosRate).times(SECONDS_PER_YEAR).div(dMATICTotalSupply).times(100).toNumber(),
      tvlUsd:
        (Number(dMATICTotalSupply) / 1e18) *
        prices[`polygon:${DAVOS.toLowerCase()}`].price,
    },
  ];
};

module.exports = {
  timetravel: false,
  apy: getApy,
  url: 'https://davos.xyz/',
};
