const { default: axios } = require('axios');

const API_BASE_URL = new URL('https://api.defindex.io/');
const DISCOVER_URL = new URL(`${API_BASE_URL}vault/discover?network=mainnet`);
const STELLAR_DECIMALS = 7;

async function fetchCoinData(assets) {
  const keys = assets.map(a => `stellar:${a.toLowerCase()}`).join(',');
  const { data } = await axios.get(`https://coins.llama.fi/prices/current/${keys}`);
  // Returns { address_lower: { price, symbol, decimals, ... } }
  return Object.entries(data.coins ?? {}).reduce((acc, [key, coin]) => {
    const address = key.split(':')[1];
    acc[address] = { price: coin.price ?? 0, symbol: coin.symbol ?? address.slice(0, 6) };
    return acc;
  }, {});
}

async function apy() {
  const { data } = await axios.get(DISCOVER_URL);
  const vaults = (data?.vaults ?? []).filter(
    v => v.apy != null && v.totalManagedFunds?.length > 0
  );

  if (vaults.length === 0) return [];

  const allAssets = [...new Set(vaults.flatMap(v => v.totalManagedFunds.map(f => f.asset)))];
  const coinData = await fetchCoinData(allAssets);

  return vaults.map(vault => {
    const underlyingTokens = vault.totalManagedFunds.map(f => f.asset);

    const tvlUsd = vault.totalManagedFunds.reduce((sum, fund) => {
      const price = coinData[fund.asset.toLowerCase()]?.price ?? 0;
      const amount = Number(fund.total_amount) / 10 ** STELLAR_DECIMALS;
      return sum + amount * price;
    }, 0);

    const symbol = vault.totalManagedFunds
      .map(f => coinData[f.asset.toLowerCase()]?.symbol ?? f.asset.slice(0, 6))
      .join('-');

    return {
      pool: `${vault.address}-stellar`.toLowerCase(),
      chain: 'Stellar',
      project: 'defindex',
      symbol,
      tvlUsd,
      apyBase: vault.apy,
      underlyingTokens,
      url: `${API_BASE_URL}/vault/${vault.address}`,
    };
  });
}

module.exports = {
  timetravel: false,
  apy,
  url: API_BASE_URL,
};
