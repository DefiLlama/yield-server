const axios = require('axios');
const utils = require('../utils');
const urls = {
  ethereum: 'https://api.vesper.finance/pools?stages=prod',
  avalanche: 'https://api-avalanche.vesper.finance/pools?stages=prod',
  optimism: 'https://api-optimism.vesper.finance/pools?stages=prod',
};

const underlyingTokenMapping = {
  eth: '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2',
  avax: '0xb31f66aa3c1e785363f0875a1b74e27b85fd66c7',
  weth: '0x4200000000000000000000000000000000000006',
};

async function apy(chain) {
  const response = (await axios.get(urls[chain])).data;

  const farms = response.map((v) => {
    const apyReward = v.poolTokenRewardRates.reduce(
      (a, r) => Number(r.tokenDeltaRates[14]) + Number(a),
      0
    );

    return {
      pool: `${v.address}`,
      chain: utils.formatChain(chain),
      project: 'vesper',
      symbol: v.asset.symbol,
      poolMeta: v.name.startsWith('ve')
        ? `earn ${v.name.split('-')[1]}`
        : v.name.startsWith('va')
        ? 'Aggressive'
        : 'Conservative',
      tvlUsd:
        (Number(v.totalValue) / 10 ** Number(v.asset.decimals)) * v.asset.price,
      apyBase: v.earningRates[14],
      apyBase7d: v.earningRates[7],
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
  return (
    await Promise.all(Object.keys(urls).map((chain) => apy(chain)))
  ).flat();
};

module.exports = {
  timetravel: false,
  apy: main,
  url: 'https://app.vesper.finance/',
};
