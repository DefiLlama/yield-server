const utils = require('../utils');

const poolsFunction = async () => {
  let poolData = [];
  //Moola pools data
  let apyData = await utils.getData(
    'https://v2-srv-data-frm-smrt-cntract.herokuapp.com/get/getReserveData'
  );
  // CoinGecko API
  let coinprices = await utils.getData(
    'https://api.coingecko.com/api/v3/simple/price?ids=celo%2Ccelo-dollar%2Ccelo-euro%2Cmoola-market&vs_currencies=usd'
  );
  // Moola-Market API for cREAL price.
  let mooPrices = await utils.getData(
    'https://v2-mooapi.herokuapp.com/get/getExchangeRates?userPublicKey=765DE816845861e75A25fCA122bb6898B8B1282a'
  );

  // Calcul cReal vs USD
  let cRealPrice =
    mooPrices['cREAL']['cUSD'] * coinprices['celo-dollar']['usd'];
  coinprices['celo-real'] = { usd: cRealPrice };

  for (let coin in apyData.data) {
    let newPool = {};
    newPool.chain = utils.formatChain('celo');
    newPool.project = 'moola-market';
    newPool.apyBase = apyData.data[coin].apy;
    switch (apyData.data[coin].currency) {
      case 'Celo':
        newPool.tvlUsd =
          Number(apyData.data[coin].availableLiquidity) *
          coinprices['celo']['usd'];
        newPool.pool = '0x7D00cd74FF385c955EA3d79e47BF06bD7386387D';
        newPool.symbol = utils.formatSymbol('Celo');
        break;
      case 'cUSD':
        newPool.tvlUsd =
          Number(apyData.data[coin].availableLiquidity) *
          coinprices['celo-dollar']['usd'];
        newPool.pool = '0x918146359264C492BD6934071c6Bd31C854EDBc3';
        newPool.symbol = utils.formatSymbol('cUSD');
        break;
      case 'cEUR':
        newPool.tvlUsd =
          Number(apyData.data[coin].availableLiquidity) *
          coinprices['celo-euro']['usd'];
        newPool.pool = '0xE273Ad7ee11dCfAA87383aD5977EE1504aC07568';
        newPool.symbol = utils.formatSymbol('cEUR');
        break;
      case 'cREAL':
        newPool.tvlUsd =
          Number(apyData.data[coin].availableLiquidity) *
          coinprices['celo-real']['usd'];
        newPool.pool = '0x9802d866fdE4563d088a6619F7CeF82C0B991A55';
        newPool.symbol = utils.formatSymbol('cREAL');
        break;
      case 'Moo':
        newPool.tvlUsd =
          Number(apyData.data[coin].availableLiquidity) *
          coinprices['moola-market']['usd'];
        newPool.pool = '0x3A5024E3AAB31A1d3184127B52b0e4B4E9ADcC34';
        newPool.symbol = utils.formatSymbol('Moo');
        break;
      default:
        break;
    }
    poolData.push(newPool);
  }
  return poolData;
};

module.exports = {
  timetravel: false,
  apy: poolsFunction,
  url: 'https://app.moola.market/',
};
