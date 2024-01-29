const axios = require('axios');

const api = 'https://core.api.allbridgecoreapi.net/token-info';

const chainMapping = {
  BSC: 'BSC',
  ETH: 'Ethereum',
  POL: 'Polygon',
  TRX: 'Tron',
  SOL: 'Solana',
  ARB: 'Arbitrum',
};

const getApy = async () => {
  const pools = (await axios.get(api)).data;

  return Object.keys(pools)
    .map((chain) => {
      return pools[chain].tokens.map((t) => {
        return {
          chain: chainMapping[chain],
          project: 'allbridge-classic',
          pool: t.poolAddress,
          symbol: t.symbol,
          apyBase: Number(t.apr),
          tvlUsd: Number(t.poolInfo.totalLpAmount) / 1e3,
        };
      });
    })
    .flat()
    .filter((i) => i.chain);
};

module.exports = {
  apy: getApy,
  url: 'https://stake.allbridge.io/?chain=SOL',
};
