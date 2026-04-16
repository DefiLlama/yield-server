const ethers = require('ethers');
const axios = require('axios');

const CHAIN = 'World Chain';
const WORLDCHAIN_RPC = 'https://worldchain-mainnet.g.alchemy.com/public';

const VAULT = '0xcE4602C16f6e83eEa77BFb3CCe6f6BCE9EcBb92E';
const USDC = '0x79A02482A880bCE3F13e09Da970dC34db4CD24d1';

const USDC_DECIMALS = 6;

const vaultAbi = [
  'function totalAssets() view returns (uint256)',
  'function totalOutstandingPrincipal() view returns (uint256)',
];

const OPTIMAL_UTILIZATION = 0.7;
const UTILIZATION_LOW_SLOPE = 1.5;
const UTILIZATION_HIGH_SLOPE = 4;

const computeSupplyApy = (utilRate) => {
  if (!Number.isFinite(utilRate) || utilRate <= 0) return 0;
  const deltaU =
    Math.min(utilRate, OPTIMAL_UTILIZATION) * UTILIZATION_LOW_SLOPE +
    Math.max(utilRate - OPTIMAL_UTILIZATION, 0) * UTILIZATION_HIGH_SLOPE;
  return deltaU * utilRate * 100;
};

const getUsdcPrice = async () => {
  const key = `wc:${USDC.toLowerCase()}`;
  const { data } = await axios.get(
    `https://coins.llama.fi/prices/current/${key}`
  );
  return data?.coins?.[key]?.price ?? 1;
};

const apy = async () => {
  const provider = new ethers.providers.JsonRpcProvider(WORLDCHAIN_RPC);
  const vault = new ethers.Contract(VAULT, vaultAbi, provider);

  const [totalAssetsRaw, totalOutstandingRaw, usdcPrice] = await Promise.all([
    vault.totalAssets(),
    vault.totalOutstandingPrincipal(),
    getUsdcPrice(),
  ]);

  const totalAssets = Number(totalAssetsRaw.toString()) / 10 ** USDC_DECIMALS;
  const totalOutstanding =
    Number(totalOutstandingRaw.toString()) / 10 ** USDC_DECIMALS;

  const utilRate = totalAssets > 0 ? totalOutstanding / totalAssets : 0;
  const tvlUsd = (totalAssets - totalOutstanding) * usdcPrice;

  return [
    {
      pool: `${VAULT}-worldchain`.toLowerCase(),
      chain: CHAIN,
      project: 'credit',
      symbol: 'USDC',
      tvlUsd,
      apyBase: computeSupplyApy(utilRate),
      underlyingTokens: [USDC],
      url: 'https://credit.cash',
    },
  ];
};

module.exports = {
  timetravel: false,
  apy,
  url: 'https://credit.cash',
};
