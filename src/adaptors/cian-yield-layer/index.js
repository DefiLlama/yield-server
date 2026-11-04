const axios = require('axios');

const apiUrls = [
  'https://data.cian.app/api/v1/staking_avax/apr',
  'https://data.cian.app/api/v1/staking_btc/apr',
  'https://data.cian.app/ethereum/api/v1/staking_eth/apy',
  'https://data.cian.app/ethereum/api/v1/staking_in1_eth/apy',
  'https://data.cian.app/ethereum/api/v1/eth_vault_steth/apy',
  'https://data.cian.app/arbitrum/api/v1/arb_vault_wsteth/apy',
  'https://data.cian.app/optimism/api/v1/op_vault_wsteth/apy',
  'https://data.cian.app/bsc/api/v1/bsc_vault_wbeth/apy',
];

// endpoints return a list of pools, a single pool object, or null (sunset product)
const fetchPools = async (url) => {
  const data = (await axios.get(url)).data?.data;
  return Array.isArray(data) ? data : data ? [data] : [];
};

async function fetch() {
  const responses = await Promise.all(apiUrls.map(fetchPools));
  return responses.flat();
}

const main = async () => {
  const data = await fetch();

  return data
    .filter((p) => p)
    .map((p) => {
      const { apyReward, ...pool } = p;
      // if - in symbol -> split, keep 1 in array, otherwise don't split
      let symbolSplit = p.symbol.split('-');
      symbolSplit = symbolSplit.length > 1 ? symbolSplit[1] : symbolSplit[0];
      const symbol = symbolSplit.replace(/ *\([^)]*\) */g, '');
      // extract content within () -> meta data; handle case where no parentheses exist
      const poolMetaMatch = /\(([^)]+)\)/.exec(symbolSplit);
      const poolMeta = poolMetaMatch ? poolMetaMatch[1] : "";

      // Filter out zero addresses from underlyingTokens
      const filteredUnderlyingTokens = p.underlyingTokens
        ?.filter(t => t && t !== '0x0000000000000000000000000000000000000000')
        || undefined;

      return {
        ...pool,
        symbol,
        poolMeta,
        project: 'cian-yield-layer',
        underlyingTokens: filteredUnderlyingTokens?.length > 0 ? filteredUnderlyingTokens : undefined,
      };
    });
};

module.exports = {
  protocolId: '5376',
  timetravel: false,
  apy: main,
  url: 'https://dapp.cian.app',
};
