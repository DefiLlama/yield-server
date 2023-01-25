const { default: BigNumber } = require('bignumber.js');
const sdk = require('@defillama/sdk');
const utils = require('../utils');
const { request, gql } = require('graphql-request');

const ETH_JOIN = '0x2D3cD7b81c93f188F3CB8aD87c8Acc73d6226e3A';
const ETH = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2';
const RAI = '0x03ab458634910AaD20eF5f1C8ee96F1D6ac54919';
const SAFEEngine = '0xCC88a9d330da1133Df3A7bD823B95e52511A6962';
const collateralType =
  '0x4554482d41000000000000000000000000000000000000000000000000000000';
const collateralTypeName = 'ETH-A';

const ABI = {
  collateralTypes: {
    inputs: [
      {
        internalType: 'bytes32',
        name: '',
        type: 'bytes32',
      },
    ],
    name: 'collateralTypes',
    outputs: [
      {
        internalType: 'uint256',
        name: 'debtAmount',
        type: 'uint256',
      },
      {
        internalType: 'uint256',
        name: 'accumulatedRate',
        type: 'uint256',
      },
      {
        internalType: 'uint256',
        name: 'safetyPrice',
        type: 'uint256',
      },
      {
        internalType: 'uint256',
        name: 'debtCeiling',
        type: 'uint256',
      },
      {
        internalType: 'uint256',
        name: 'debtFloor',
        type: 'uint256',
      },
      {
        internalType: 'uint256',
        name: 'liquidationPrice',
        type: 'uint256',
      },
    ],
    stateMutability: 'view',
    type: 'function',
  },
};
const HOUR = 60 * 60;
const DAY = 24 * HOUR;
const SECONDS_PER_YEAR = 365 * DAY;
const API_URL =
  'https://subgraph.reflexer.finance/subgraphs/name/reflexer-labs/rai';
const query = gql`
  query getCollateralTypes {
    collateralTypes {
      id
      liquidationCRatio
      modifiedAt
    }
  }
`;
const liquidationCRatio = async () => {
  const result = await request(API_URL, query);
  return result.collateralTypes.find((e) => e.id === collateralTypeName)
    ?.liquidationCRatio;
};
const BIG_TEN = new BigNumber(10);
const main = async () => {
  const balance = (
    await sdk.api.erc20.balanceOf({
      target: ETH,
      owner: ETH_JOIN,
      chain: 'ethereum',
    })
  ).output;

  const collateralTypesCall = (
    await sdk.api.abi.call({
      target: SAFEEngine,
      abi: ABI.collateralTypes,
      params: [collateralType],
    })
  ).output;

  const prices = (await utils.getPrices([`ethereum:${ETH}`, `ethereum:${RAI}`]))
    .pricesByAddress;
  const tvlUsd = new BigNumber(balance)
    .div(BIG_TEN.pow(18))
    .times(prices[ETH.toLowerCase()]);
  const totalBorrowUsd = new BigNumber(collateralTypesCall.debtAmount)
    .div(BIG_TEN.pow(18))
    .times(prices[RAI.toLowerCase()]);
  const debtCeilingUsd = new BigNumber(collateralTypesCall.debtCeiling)
    .div(BIG_TEN.pow(45))
    .times(prices[RAI.toLowerCase()]);
  const normalizRate = new BigNumber(
    collateralTypesCall.accumulatedRate
  ).dividedBy(BIG_TEN.pow(27));
  BigNumber.config({ POW_PRECISION: 100 });
  const stabilityFee = normalizRate.toNumber();
  const liquidationRatio = await liquidationCRatio();
  const ltv = 1 / Number(liquidationRatio);
  return [
    {
      pool: ETH_JOIN,
      project: 'reflexer',
      symbol: 'WETH',
      chain: 'ethereum',
      apy: 0,
      tvlUsd: tvlUsd.toNumber(),
      // borrow fields
      apyBaseBorrow: ((stabilityFee - 1) / 1) * 100,
      totalSupplyUsd: tvlUsd.toNumber(),
      totalBorrowUsd: totalBorrowUsd.toNumber(),
      debtCeilingUsd: debtCeilingUsd.toNumber(),
      mintedCoin: 'RAI',
      ltv,
    },
  ];
};

module.exports = {
  timetravel: false,
  apy: main,
  url: 'https://reflexer.finance/',
};
