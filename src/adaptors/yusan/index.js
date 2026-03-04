const utils = require('../utils');

const API_URL =
  'https://yusan.fi/defillama_pools';

// ICP ledger canister IDs
const ICP_TOKENS = {
  ICP: 'ryjl3-tyaaa-aaaaa-aaaba-cai',
  BTC: 'mxzaz-hqaaa-aaaar-qaada-cai',
  USDC: 'xevnm-gaaaa-aaaar-qafnq-cai',
  USDT: 'cngnf-vqaaa-aaaar-qag4q-cai',
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
