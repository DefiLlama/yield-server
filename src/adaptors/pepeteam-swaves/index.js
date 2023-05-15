const utils = require('../utils');
const { data } = require('./waves');

const wavesStakingContract = '3PDPzZVLhN1EuzGy4xAxjjTVkawKDLEaHiV';

async function tvlUsd() {
  const contractTVLInWAVES = await data(wavesStakingContract, 'STAKING_AMOUNT');

  const priceKeys = ['waves', 'usd'].map((t) => `coingecko:${t}`).join(',');
  const { coins: prices } = await utils.getData(
    `https://coins.llama.fi/prices/current/${priceKeys}`
  );

  const wavesPrice = prices['coingecko:waves'].price;
  return (contractTVLInWAVES.value / 1e8) * wavesPrice;
}

async function apyBase() {
  const deltaRateResponse = await data(wavesStakingContract, 'CURRENT_RATE');
  const deltaRateBytes = Buffer.from(
    deltaRateResponse.value.substr(7),
    'base64'
  );
  var aprPerDay =
    ((1440 * deltaRateBytes.readUIntBE(0, deltaRateBytes.length)) / 1e12) * 100; // 1440 blocks/day, 10^12 - contract divider
  var apy = utils.aprToApy(aprPerDay * 365);
  return apy;
}

async function apy() {
  return [
    {
      pool: wavesStakingContract,
      symbol: utils.formatSymbol('sWAVES'),
      tvlUsd: await tvlUsd(),
      apyBase: await apyBase(),
      project: 'pepeteam-swaves',
      chain: utils.formatChain('waves'),
    },
  ];
}

module.exports = {
  timetravel: false, // Waves blockchain
  apy,
  url: 'https://swaves.pepe.team',
};
