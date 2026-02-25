const sdk = require('@defillama/sdk');
const axios = require('axios');
const utils = require('../utils');

// sUSDai (staked USDai) token addresses
const sUSDai = {
  arbitrum: '0x0b2b2b2076d95dda7817e785989fe353fe955ef9',
  plasma: '0x0b2b2b2076d95dda7817e785989fe353fe955ef9',
};

// USDai (underlying) token addresses
const USDai = {
  arbitrum: '0x0A1a1A107E45b7Ced86833863f482BC5f4ed82EF',
  plasma: '0x0A1a1A107E45b7Ced86833863f482BC5f4ed82EF',
};

const API_URL = 'https://api.usd.ai/usdai/dashboard';

const apy = async () => {
  // Get current APY from USD.AI API
  const { data: apyData } = await axios.get(`${API_URL}/current-apy`);
  const apyBase = apyData.result; // Already in percentage (e.g. 6.28)

  const pools = [];

  for (const [chain, address] of Object.entries(sUSDai)) {
    // Get sUSDai total supply on this chain
    let totalSupply;
    try {
      totalSupply =
        (
          await sdk.api.abi.call({
            target: address,
            abi: 'erc20:totalSupply',
            chain,
          })
        ).output / 1e18;
    } catch {
      continue;
    }

    // Get sUSDai price
    const priceKey = `${chain}:${address}`;
    let price;
    try {
      const { data: priceData } = await axios.get(
        `https://coins.llama.fi/prices/current/${priceKey}`
      );
      price = priceData.coins[priceKey]?.price;
    } catch {
      // Fallback: fetch from USD.AI API
      const { data: intgData } = await axios.get(
        'https://api.usd.ai/usdai/wallet/integrations-data'
      );
      price = intgData[`susdai_${chain}`]?.usdPrice || 1.07;
    }

    const tvlUsd = totalSupply * (price || 1.07);

    const chainFormatted = utils.formatChain(chain);

    pools.push({
      pool: `${address}-${chain}`,
      symbol: 'sUSDai',
      project: 'usd-ai',
      chain: chainFormatted,
      tvlUsd,
      apyBase,
      underlyingTokens: [USDai[chain]],
      poolMeta: 'Yield from GPU compute infrastructure financing',
    });
  }

  return pools;
};

module.exports = {
  timetravel: false,
  apy,
  url: 'https://app.usd.ai/',
};
