const sdk = require('@defillama/sdk');
const axios = require('axios');

const CHAIN = 'World Chain';
const SDK_CHAIN = 'wc';

const VAULT = '0xcE4602C16f6e83eEa77BFb3CCe6f6BCE9EcBb92E';
const PARAMETERS = '0x87A865E102293F2dDA34d204661480f627B9daEf';
const USDC = '0x79A02482A880bCE3F13e09Da970dC34db4CD24d1';

const USDC_DECIMALS = 6;

const readUint = (chain, target, abi) =>
  sdk.api.abi
    .call({ chain, target, abi })
    .then((res) => Number(res.output));

const computeSupplyApy = (utilRate, params) => {
  if (!Number.isFinite(utilRate) || utilRate <= 0) return 0;
  const deltaU =
    Math.min(utilRate, params.optimalUtilization) * params.utilizationLowSlope +
    Math.max(utilRate - params.optimalUtilization, 0) *
      params.utilizationHighSlope;
  return deltaU * utilRate * 100;
};

const getUsdcPrice = async () => {
  const key = `${SDK_CHAIN}:${USDC.toLowerCase()}`;
  const { data } = await axios.get(
    `https://coins.llama.fi/prices/current/${key}`
  );
  return data?.coins?.[key]?.price ?? 1;
};

const apy = async () => {
  const [
    totalAssetsRaw,
    totalOutstandingRaw,
    precision,
    optimalUtilizationRaw,
    utilizationLowSlopeRaw,
    utilizationHighSlopeRaw,
    usdcPrice,
  ] = await Promise.all([
    readUint(SDK_CHAIN, VAULT, 'uint256:totalAssets'),
    readUint(SDK_CHAIN, VAULT, 'uint256:totalOutstandingPrincipal'),
    readUint(SDK_CHAIN, PARAMETERS, 'uint256:PRECISION'),
    readUint(SDK_CHAIN, PARAMETERS, 'uint256:optimalUtilization'),
    readUint(SDK_CHAIN, PARAMETERS, 'uint256:utilizationLowSlope'),
    readUint(SDK_CHAIN, PARAMETERS, 'uint256:utilizationHighSlope'),
    getUsdcPrice(),
  ]);

  const totalAssets = totalAssetsRaw / 10 ** USDC_DECIMALS;
  const totalOutstanding = totalOutstandingRaw / 10 ** USDC_DECIMALS;

  const params = {
    optimalUtilization: optimalUtilizationRaw / precision,
    utilizationLowSlope: utilizationLowSlopeRaw / precision,
    utilizationHighSlope: utilizationHighSlopeRaw / precision,
  };

  const utilRate = totalAssets > 0 ? totalOutstanding / totalAssets : 0;
  const tvlUsd = totalAssets * usdcPrice;

  return [
    {
      pool: `${VAULT}-worldchain`.toLowerCase(),
      chain: CHAIN,
      project: 'credit',
      symbol: 'USDC',
      tvlUsd,
      apyBase: computeSupplyApy(utilRate, params),
      underlyingTokens: [USDC],
      url: 'https://credit.cash',
      poolMeta: '$3M supply cap',
    },
  ];
};

module.exports = {
  timetravel: false,
  apy,
  url: 'https://credit.cash',
};
