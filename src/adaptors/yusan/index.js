const utils = require('../utils');

const API_URL =
  'https://yusan.fi/defillama_pools';

// ICP ledger canister IDs
const ICP_TOKENS = {
  ICP: 'coingecko:internet-computer',
  BTC: 'coingecko:bitcoin',
  USDC: 'coingecko:usd-coin',
  USDT: 'coingecko:tether',
};

const getApy = async () => {
  const pools = await utils.getData(API_URL);
  return pools.map((p) => ({
    ...p,
    underlyingTokens: ICP_TOKENS[p.symbol] ? [ICP_TOKENS[p.symbol]] : undefined,
  }));
};

module.exports = {
  timetravel: false,
  apy: getApy,
  url: 'https://yusan.fi',
};
