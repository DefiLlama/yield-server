const axios = require('axios');
const utils = require('../utils');
const urls = {
  polygon: 'https://api-polygon.vesper.finance/pools?stages=prod',
  ethereum: 'https://api.vesper.finance/pools?stages=prod',
  avalanche: 'https://api-avalanche.vesper.finance/pools?stages=prod',
};

const underlyingTokenMapping = {
  eth: '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2',
  avax: '0xb31f66aa3c1e785363f0875a1b74e27b85fd66c7',
  matic: '0x0d500b1d8e8ef31e21c99d1db9a6444d3adf1270',
};

async function apy(chain) {
  const response = (await axios.get(urls[chain])).data;

  const farms = response.map((v) => {
    const apyReward = v.poolTokenRewardRates.reduce(
      (a, r) => Number(r.tokenDeltaRates[30]) + Number(a),
      0
    );

    return {
      pool: `${v.address}`,
      chain: utils.formatChain(chain),
      project: 'vesper',
      symbol: v.name.startsWith('ve')
        ? v.name.split('-')[0]
        : utils.formatSymbol(v.name),
      poolMeta: v.name.startsWith('ve') ? `earn ${v.name.split('-')[1]}` : null,
      tvlUsd:
        (Number(v.totalValue) / 10 ** Number(v.asset.decimals)) * v.asset.price,
      apyBase: v.earningRates[30],
      apyReward,
      rewardTokens: apyReward > 0 ? [v.rewardsTokenAddress] : [],
      underlyingTokens:
        v.asset.address === null
          ? [underlyingTokenMapping[v.asset.symbol.toLowerCase()]]
          : [v.asset.address],
    };
  });

  return farms;
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
  url: 'https://app.vesper.finance/',
};
