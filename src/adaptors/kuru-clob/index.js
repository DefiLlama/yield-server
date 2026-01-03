const axios = require('axios');

const API_URL = 'https://api.kuru.io/api/v2/vaults';

const apy = async () => {
  let pools = [];
  let allVaults = [];
  let offset = 0;
  const limit = 100;

  while (true) {
    const response = await axios.get(API_URL, {
      params: {
        limit,
        offset,
      },
    });

    const vaults = response.data?.data?.data || [];

    allVaults = allVaults.concat(vaults);

    if (vaults.length < limit || vaults.length === 0) {
      break;
    }

    offset += limit;
  }

  pools = allVaults.map((vault) => {
    const tvl = vault.tvl24h || 0;
    const fees24h = parseFloat(vault.fees24h) || 0;
    const apyBase = vault.apr24h === 0 && tvl > 0 ? (fees24h * 365 * 100) / tvl : vault.apr24h
    const symbol = `${vault.basetoken.ticker}-${vault.quotetoken.ticker}`;

    return {
      pool: `${vault.vaultaddress}-monad`.toLowerCase(),
      chain: 'monad',
      project: 'kuru-clob',
      symbol,
      tvlUsd: tvl,
      apyBase,
      underlyingTokens: [
        vault.basetoken.address,
        vault.quotetoken.address,
      ],
      url: `https://kuru.io/liquidity/${vault.vaultaddress}`,
    };
  });

  return pools;
};

module.exports = {
  timetravel: false,
  apy,
};

