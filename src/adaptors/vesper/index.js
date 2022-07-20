const axios = require('axios');
const utils = require('../utils');
const urls = {
  polygon: 'https://api-polygon.vesper.finance/pools?stages=prod',
  ethereum: 'https://api.vesper.finance/pools?stages=prod',
  avalanche: 'https://api-avalanche.vesper.finance/pools?stages=prod',
};

async function apy(chain) {
  const response = (await axios.get(urls[chain])).data;
  null();

  const farms = response.map((v) => ({
    pool: `${v.address}`,
    chain: utils.formatChain(chain),
    project: 'vesper',
    symbol: v.name.startsWith('ve')
      ? `${v.name.split('-')[0]} (earn ${v.name.split('-')[1]})`
      : utils.formatSymbol(v.name),
    tvlUsd: null,
    //   (Number(v.totalValue) / 10 ** Number(v.asset.decimals)) * v.asset.price,
    apy: aggregateApys(v),
  }));

  return farms;
}

function aggregateApys(pool) {
  const earningRate = pool.earningRates[30];
  const rewardRate = pool.poolTokenRewardRates.reduce(
    (a, r) => Number(r.tokenDeltaRates[30]) + Number(a),
    0
  );
  return earningRate + rewardRate;
}

const main = async () => {
  const [p, e, a] = await Promise.all([
    apy('polygon'),
    apy('ethereum'),
    apy('avalanche'),
  ]);

  return [...p, ...e, ...a];
};

module.exports = {
  timetravel: false,
  apy: main,
}; // node src/adaptors/test.js src/adaptors/vesper/index.js
