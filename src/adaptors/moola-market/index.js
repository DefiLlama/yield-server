const utils = require('../utils');

// Celo token addresses
const CELO_TOKENS = {
  CELO: '0x471EcE3750Da237f93B8E339c536989b8978a438',
  cUSD: '0x765DE816845861e75A25fCA122bb6898B8B1282a',
  cEUR: '0xD8763CBa276a3738E6DE85b4b3bF5FDed6D6cA73',
  cREAL: '0xe8537a3d056DA446677B9E9d6c5dB704EaAb4787',
  MOO: '0x17700282592D6917F6A73D0bF8AcCf4D578c131e',
};

const poolsFunction = async () => {
  let poolData = [];
  //Moola pools data
  let apyData = await utils.getData(
    'https://v2-srv-data-frm-smrt-cntract.herokuapp.com/get/getReserveData'
  );

  const priceKeys = ['celo', 'celo-dollar', 'celo-euro', 'moola-market']
    .map((t) => `coingecko:${t}`)
    .join(',');
  let { coins: coinprices } = await utils.getData(
    `https://coins.llama.fi/prices/current/${priceKeys}`
  );

  // Moola-Market API for cREAL price.
  let mooPrices = await utils.getData(
    'https://v2-mooapi.herokuapp.com/get/getExchangeRates?userPublicKey=765DE816845861e75A25fCA122bb6898B8B1282a'
  );

  // Calcul cReal vs USD
  const cRealCusd = mooPrices?.['cREAL']?.['cUSD'];
  const cusdPrice = coinprices['coingecko:celo-dollar']?.price;
  if (cRealCusd && cusdPrice) {
    coinprices['celo-real'] = { usd: cRealCusd * cusdPrice };
  }

  const poolMeta = {
    Celo: {
      pool: '0x7D00cd74FF385c955EA3d79e47BF06bD7386387D',
      symbol: 'Celo',
      priceKey: 'coingecko:celo',
      underlyingTokens: [CELO_TOKENS.CELO],
    },
    cUSD: {
      pool: '0x918146359264C492BD6934071c6Bd31C854EDBc3',
      symbol: 'cUSD',
      priceKey: 'coingecko:celo-dollar',
      underlyingTokens: [CELO_TOKENS.cUSD],
    },
    cEUR: {
      pool: '0xE273Ad7ee11dCfAA87383aD5977EE1504aC07568',
      symbol: 'cEUR',
      priceKey: 'coingecko:celo-euro',
      underlyingTokens: [CELO_TOKENS.cEUR],
    },
    cREAL: {
      pool: '0x9802d866fdE4563d088a6619F7CeF82C0B991A55',
      symbol: 'cREAL',
      priceKey: 'celo-real',
      underlyingTokens: [CELO_TOKENS.cREAL],
    },
    Moo: {
      pool: '0x3A5024E3AAB31A1d3184127B52b0e4B4E9ADcC34',
      symbol: 'Moo',
      priceKey: 'coingecko:moola-market',
      underlyingTokens: [CELO_TOKENS.MOO],
    },
  };

  for (let coin in apyData.data) {
    const currency = apyData.data[coin].currency;
    const meta = poolMeta[currency];
    if (!meta) continue;

    const priceObj = coinprices[meta.priceKey];
    const price = priceObj?.price ?? priceObj?.usd;
    if (price == null) continue;

    poolData.push({
      chain: utils.formatChain('celo'),
      project: 'moola-market',
      pool: meta.pool,
      symbol: meta.symbol,
      apyBase: apyData.data[coin].apy,
      tvlUsd: Number(apyData.data[coin].availableLiquidity) * price,
      underlyingTokens: meta.underlyingTokens,
    });
  }
  return poolData;
};

module.exports = {
  timetravel: false,
  apy: poolsFunction,
  url: 'https://app.moola.market/',
};
