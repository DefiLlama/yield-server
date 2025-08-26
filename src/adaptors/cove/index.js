const utils = require('../utils');
const sdk = require('@defillama/sdk');

const API_URL = 'https://app.cove.finance/api/v1/apys?chainId=1';
const basketManager = '0x716c39658Ba56Ce34bdeCDC1426e8768E61912f8';
const basketTokensAbi = 'function basketTokens() view returns (address[])';

const getApy = async () => {
  try {
    // Fetch basket tokens from on-chain
    const basketTokensCall = await sdk.api.abi.call({
      target: basketManager,
      abi: basketTokensAbi,
      chain: 'ethereum',
    });

    const basketTokens = basketTokensCall.output;

    // Fetch APY data from Cove API
    const res = await fetch(API_URL);
    const apiResponse = await res.json();
    const apyData = apiResponse.data;

    // Get totalSupply for all basket tokens
    const totalSupplyCalls = await sdk.api.abi.multiCall({
      calls: basketTokens.map((token) => ({
        target: token,
      })),
      abi: 'erc20:totalSupply',
      chain: 'ethereum',
    });

    // Get decimals for all basket tokens
    const decimalsCalls = await sdk.api.abi.multiCall({
      calls: basketTokens.map((token) => ({
        target: token,
      })),
      abi: 'erc20:decimals',
      chain: 'ethereum',
    });

    const pools = [];

    for (let i = 0; i < basketTokens.length; i++) {
      const tokenAddress = basketTokens[i].toLowerCase();
      const tokenData = apyData[basketTokens[i]];

      if (!tokenData) {
        console.log(`No APY data found for basket token: ${basketTokens[i]}`);
        continue;
      }

      const totalSupply = totalSupplyCalls.output[i].output;
      const decimals = decimalsCalls.output[i].output;

      if (!totalSupply || !decimals) {
        console.log(
          `Missing supply/decimals data for token: ${basketTokens[i]}`,
        );
        continue;
      }

      // Calculate TVL
      const totalSupplyFormatted =
        Number(totalSupply) / Math.pow(10, Number(decimals));
      const price = parseFloat(tokenData.price);
      const tvlUsd = totalSupplyFormatted * price;

      // Use 7-day USDC APY as it's more stable than 24h
      const apyBase = tokenData['7d'] ? parseFloat(tokenData['7d'].usdcApy) : 0;

      const pool = {
        pool: `${tokenAddress}-ethereum`,
        chain: 'Ethereum',
        project: 'cove',
        symbol: tokenData.symbol,
        tvlUsd: tvlUsd,
        apyBase: apyBase,
        url: `https://app.cove.finance/vaults/${tokenAddress}`,
        underlyingTokens: [tokenAddress],
      };

      pools.push(pool);
    }

    return pools.filter((p) => utils.keepFinite(p) && p.tvlUsd > 0);
  } catch (error) {
    console.error('Error fetching Cove data:', error);
    return [];
  }
};

module.exports = {
  timetravel: false,
  apy: getApy,
};
