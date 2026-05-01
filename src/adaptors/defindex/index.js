const { default: axios } = require('axios');
const utils = require('../utils');

const API_BASE_URL = 'https://api.defindex.io';
const STELLAR_DECIMALS = 7;
const START_TIMESTAMP = 1747281600;

async function fetchCoinData(assets) {
  const keys = assets.map(a => `stellar:${a.toLowerCase()}`).join(',');
  const { data } = await axios.get(`https://coins.llama.fi/prices/current/${keys}`);
  return Object.entries(data.coins ?? {}).reduce((acc, [key, coin]) => {
    const address = key.split(':')[1];
    acc[address] = {
      price: coin.price ?? 0,
      symbol: coin.symbol ?? address.slice(0, 6),
      decimals: coin.decimals ?? STELLAR_DECIMALS,
    };
    return acc;
  }, {});
}

async function apy(timestamp = null) {
  const ts = timestamp ?? Math.floor(Date.now() / 1000);

  const { data: strategies } = await axios.get(
    `${API_BASE_URL}/strategies/apy?timestamp=${ts}&network=mainnet`,
  );

  if (!strategies.length) return [];

  const allAssets = [...new Set(strategies.map(s => s.asset))];
  const coinData = await fetchCoinData(allAssets);

  return strategies.flatMap(strategy => {
    const coin = coinData[strategy.asset.toLowerCase()];
    const decimals = coin?.decimals ?? strategy.assetDecimals ?? STELLAR_DECIMALS;
    const price = coin?.price ?? 0;
    const tvlUsd = Math.max(0, (Number(strategy.tvl) / 10 ** decimals) * price);
    if (tvlUsd < 1) return [];

    const symbol = coin?.symbol ?? strategy.assetSymbol ?? strategy.asset.slice(0, 6);

    return [{
      pool: `${strategy.address}-stellar`.toLowerCase(),
      chain: 'Stellar',
      project: 'defindex',
      symbol,
      tvlUsd,
      apyBase: strategy.apy7d,
      underlyingTokens: [strategy.asset],
      url: `https://stellar.expert/explorer/public/contract/${strategy.address}`,
    }];
  }).filter(p => utils.keepFinite(p));
}

module.exports = {
  timetravel: true,
  start: START_TIMESTAMP,
  apy,
  url: "https://www.defindex.io/strategies",
};
