const axios = require('axios');

const MSOL_ADDRESS = 'mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So';
const priceKey = `solana:${MSOL_ADDRESS}`;

const getTotalSupply = async (tokenMintAddress) => {
  const rpcUrl = 'https://api.mainnet-beta.solana.com';
  const requestBody = {
    jsonrpc: '2.0',
    id: 1,
    method: 'getTokenSupply',
    params: [
      tokenMintAddress,
      {
        commitment: 'confirmed',
      },
    ],
  };

  const response = await axios.post(rpcUrl, requestBody, {
    headers: {
      'Content-Type': 'application/json',
    },
  });

  const data = response.data;
  if (data.error) {
    throw new Error(`Error fetching total supply: ${data.error.message}`);
  }

  const totalSupply = data.result.value.amount;
  const decimals = data.result.value.decimals;
  const supplyInTokens = totalSupply / Math.pow(10, decimals);

  return supplyInTokens;
};

const apy = async () => {
  const [apyResponse, priceResponse, totalSupply] = await Promise.all([
    axios.get('https://api.marinade.finance/msol/apy/7d'),
    axios.get(`https://coins.llama.fi/prices/current/${priceKey}`),
    getTotalSupply(MSOL_ADDRESS),
  ]);

  const apyValue = apyResponse.data.value;
  const currentPrice = priceResponse.data.coins[priceKey].price;
  const tvlUsd = totalSupply * currentPrice;

  return [
    {
      pool: MSOL_ADDRESS,
      chain: 'Solana',
      project: 'marinade-liquid-staking',
      symbol: 'MSOL',
      tvlUsd: tvlUsd,
      apyBase: apyValue * 100,
      underlyingTokens: [MSOL_ADDRESS],
    },
  ];
};

module.exports = { apy, url: 'https://marinade.finance/liquid-staking' };
