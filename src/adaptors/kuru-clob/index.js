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

  pools = await Promise.all(
    allVaults.map(async (vault) => {
      
      const quoteTokenPriceKey = `monad:${vault.quotetoken.address}`;
      const quoteTokenPriceResponse = await axios.get(
        `https://coins.llama.fi/prices/current/${quoteTokenPriceKey}`
      );
      const quoteTokenPrice = quoteTokenPriceResponse.data.coins[quoteTokenPriceKey]?.price;

      const tvl = vault.tvl24h || 0;
      const tvlUsd = tvl * quoteTokenPrice;

      const fees24h = parseFloat(vault.fees24h) || 0;
      const apyBase =
        vault.apr24h === 0 && tvl > 0
          ? (fees24h * 365 * 100) / tvl
          : vault.apr24h;
      const symbol = `${vault.basetoken.ticker}-${vault.quotetoken.ticker}`;

      return {
        pool: `${vault.vaultaddress}-monad`.toLowerCase(),
        chain: 'monad',
        project: 'kuru-clob',
        symbol,
        tvlUsd,
        apyBase,
        poolMeta: `${vault.vaultfeebps / 10000}% (${vault.vaultaddress})`,
        underlyingTokens: [vault.basetoken.address, vault.quotetoken.address],
        url: `https://kuru.io/liquidity/${vault.vaultaddress}`,
      };
    })
  );

  return pools;
};

module.exports = {
  timetravel: false,
  apy,
};
