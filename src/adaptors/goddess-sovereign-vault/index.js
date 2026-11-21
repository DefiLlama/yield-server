const sdk = require('@defillama/sdk');
const axios = require('axios');

const VAULT_ADDRESS = '0xbF732B50C1003E12B978cC85B36Bd9455BF0e91f';
const ARBITRUM_USDC = '0xaf88d065e77c8cC2239327C5EDb3A432268e5831';

const VAULT_ABI = {
  totalAssets: 'function totalAssets() external view returns (uint256)',
  currentSharePrice: 'function currentSharePrice() external view returns (uint256)',
};

const getApy = async () => {
  const totalAssetsRes = await sdk.api.abi.call({
    target: VAULT_ADDRESS,
    abi: VAULT_ABI.totalAssets,
    chain: 'arbitrum',
  });

  const sharePriceRes = await sdk.api.abi.call({
    target: VAULT_ADDRESS,
    abi: VAULT_ABI.currentSharePrice,
    chain: 'arbitrum',
  });

  const priceKey = `arbitrum:${ARBITRUM_USDC}`;
  const priceRes = await axios.get(`https://llama.fi{priceKey}`);
  const usdcPrice = priceRes.data?.coins?.[priceKey]?.price || 1;

  const tvlUsd = (Number(totalAssetsRes.output) / 1e6) * usdcPrice;
  const currentPrice = Number(sharePriceRes.output) / 1e18;
  const apyBase = currentPrice > 1 ? (currentPrice - 1) * 100 : null;

  return [
    {
      pool: `${VAULT_ADDRESS}-arbitrum`.toLowerCase(),
      chain: 'Arbitrum',
      project: 'goddess-sovereign-vault',
      symbol: 'gUSDC',
      tvlUsd,
      apyBase,
      underlyingTokens: [ARBITRUM_USDC],
      url: 'https://arbiscan.io',
      poolMeta: 'ERC-4626 Multi-Pool Strategy (Aave V3 / Curve / Pendle)',
    },
  ];
};

module.exports = {
  timetravel: false,
  apy: getApy,
  url: 'https://arbiscan.io',
};
