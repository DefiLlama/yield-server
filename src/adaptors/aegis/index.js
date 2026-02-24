const sdk = require('@defillama/sdk');
const axios = require('axios');

async function getTvl(token, chain) {
  const tvl = await sdk.api.abi.call({
    target: token,
    abi: 'uint256:totalSupply',
    chain: chain
  });
  return tvl.output / 1e18;
}

// USDT addresses for underlying
const USDT_ETH = '0xdAC17F958D2ee523a2206206994597C13D831ec7';
const USDT_BSC = '0x55d398326f99059fF775485246999027B3197955';

const apy = async () => {
  const aegisFetch = await axios.get('https://api.aegis.im/api/project-stats', {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
    },
  });

  const aegisData = aegisFetch.data.data;
  const aegisEth = '0x4274cD7277C7bb0806Bd5FE84b9aDAE466a8DA0a';
  const aegisBsc = '0xAB3dBcD9B096C3fF76275038bf58eAC10D22C61f';

  const aegisEthTvl = await getTvl(aegisEth, 'ethereum');
  const aegisBscTvl = await getTvl(aegisBsc, 'bsc');
  const yusdPools = [
    {
      pool: '0x4274cD7277C7bb0806Bd5FE84b9aDAE466a8DA0a-ethereum'.toLowerCase(),
      chain: 'Ethereum',
      project: 'aegis',
      symbol: 'YUSD',
      tvlUsd: aegisEthTvl,
      apy: aegisData.efficient_apr,
      underlyingTokens: [USDT_ETH],
    },
    {
      pool: '0xAB3dBcD9B096C3fF76275038bf58eAC10D22C61f-binance'.toLowerCase(),
      chain: 'Binance',
      project: 'aegis',
      symbol: 'YUSD',
      tvlUsd: aegisBscTvl,
      apy: aegisData.efficient_apr,
      underlyingTokens: [USDT_BSC],
    },
  ];

  return yusdPools;
};

module.exports = {
  timetravel: false,
  apy,
  url: 'https://app.aegis.im/',
};
