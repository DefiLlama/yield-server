const sdk = require('@defillama/sdk');
const utils = require('../utils');

const SUSDAT_ADDRESS = '0xD166337499E176bbC38a1FBd113Ab144e5bd2Df7';
const USDAT_ADDRESS = '0x23238f20b894f29041f48D88eE91131C395Aaa71';
const STRC_PRICE_ORACLE_ADDRESS = '0x5f7eCD0D045c393da6cb6c933c671AC305A871BF';

const abi = {
  totalAssets: {
    inputs: [],
    name: 'totalAssets',
    outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  convertToAssets: {
    inputs: [{ internalType: 'uint256', name: 'shares', type: 'uint256' }],
    name: 'convertToAssets',
    outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  vestingAmount: 'uint256:vestingAmount',
  usdatBalance: 'uint256:usdatBalance',
  vestingPeriod: 'uint256:vestingPeriod',
  getStrcPrice: {
    inputs: [],
    name: 'getPrice',
    outputs: [
      { internalType: 'uint256', name: '', type: 'uint256' },
      { internalType: 'uint8', name: '', type: 'uint8' },
    ],
    stateMutability: 'view',
    type: 'function',
  },
};

const ONE_E18 = '1000000000000000000';

const getSaturnApy = ({
  totalAssets,
  vestingAmount,
  usdatBalance,
  strcPrice,
  vestingPeriod,
}) => {
  const totalAssetsNum = Number(totalAssets);
  const vestingAmountNum = Number(vestingAmount);
  const usdatBalanceNum = Number(usdatBalance);
  const vestingPeriodDays = Number(vestingPeriod) / 86400;

  if (
    totalAssetsNum <= 0 ||
    vestingAmountNum <= 0 ||
    strcPrice <= 0 ||
    vestingPeriodDays <= 0
  ) {
    return 0;
  }

  const vestingYield =
    (vestingAmountNum * strcPrice * 365 * 100) /
    (totalAssetsNum * vestingPeriodDays);
  const strcShare = Math.max(totalAssetsNum - usdatBalanceNum, 0) / totalAssetsNum;
  const discountYield =
    strcPrice < 100 ? ((100 - strcPrice) / strcPrice) * strcShare * 100 : 0;

  return vestingYield + discountYield;
};

const main = async () => {
  const [
    totalAssets,
    rateNow,
    vestingAmount,
    usdatBalance,
    vestingPeriod,
    strcPriceData,
  ] = await Promise.all([
    sdk.api.abi.call({
      target: SUSDAT_ADDRESS,
      chain: 'ethereum',
      abi: abi.totalAssets,
    }),
    sdk.api.abi.call({
      target: SUSDAT_ADDRESS,
      abi: abi.convertToAssets,
      params: [ONE_E18],
      chain: 'ethereum',
    }),
    sdk.api.abi.call({
      target: SUSDAT_ADDRESS,
      chain: 'ethereum',
      abi: abi.vestingAmount,
    }),
    sdk.api.abi.call({
      target: SUSDAT_ADDRESS,
      chain: 'ethereum',
      abi: abi.usdatBalance,
    }),
    sdk.api.abi.call({
      target: SUSDAT_ADDRESS,
      chain: 'ethereum',
      abi: abi.vestingPeriod,
    }),
    sdk.api.abi.call({
      target: STRC_PRICE_ORACLE_ADDRESS,
      chain: 'ethereum',
      abi: abi.getStrcPrice,
    }),
  ]);

  const [strcPriceRaw, strcPriceDecimals] = strcPriceData.output;
  const strcPrice = Number(strcPriceRaw) / 10 ** Number(strcPriceDecimals);
  const apyBase = getSaturnApy({
    totalAssets: totalAssets.output,
    vestingAmount: vestingAmount.output,
    usdatBalance: usdatBalance.output,
    strcPrice,
    vestingPeriod: vestingPeriod.output,
  });

  const priceKey = `ethereum:${USDAT_ADDRESS}`;
  const usdatPrice = (await utils.getPriceApiData(`/prices/current/${priceKey}`)).coins[priceKey]?.price;

  const tvlUsd = (totalAssets.output / 1e6) * usdatPrice;

  return [
    {
      pool: SUSDAT_ADDRESS,
      chain: utils.formatChain('ethereum'),
      project: 'saturn',
      symbol: 'sUSDat',
      tvlUsd,
      apyBase,
      // USDat is 6-dec; sUSDat shares are 18-dec.
      ...(Number(rateNow.output) / 1e6 > 0 && { pricePerShare: Number(rateNow.output) / 1e6 }),
      underlyingTokens: [USDAT_ADDRESS],
    },
  ];
};

module.exports = {
  protocolId: '7646',
  timetravel: false,
  apy: main,
  url: 'https://app.saturn.credit/',
};
