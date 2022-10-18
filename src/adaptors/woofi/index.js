const BigNumber = require('bignumber.js');
const utils = require('../utils');

const API_URL = 'https://fi-api.woo.org/yield';

const API_URLS = {
  binance: `${API_URL}?network=bsc`,
  avalanche: `${API_URL}?network=avax`,
  fantom: `${API_URL}?network=fantom`,
  polygon: `${API_URL}?network=polygon`,
};

const xWOOMapping = {
    binance: '0x2AEab1a338bCB1758f71BD5aF40637cEE2085076',
    avalanche: '0xcd1B9810872aeC66d450c761E93638FB9FE09DB0',
    fantom: '0x2Fe5E5D341cFFa606a5d9DA1B6B646a381B0f7ec',
    polygon: '0x9BCf8b0B62F220f3900e2dc42dEB85C3f79b405B',
}

const main = async () => {
  const datas = await Promise.all(
    Object.entries(API_URLS).map(async ([chain, url]) => [
        chain,
        (await utils.getData(url))['data']['auto_compounding'],
    ])
  );

  let results = [];
  for (const [chain, data] of datas) {
    for (const [address, info] of Object.entries(data)) {
        if (info['source'] !== 'woofi_super_charger') continue;

        let decimals = info['decimals'];
        results.push({
            pool: `${address}-${chain}`.toLowerCase(),
            chain: utils.formatChain(chain),
            project: 'woofi',
            symbol: `${info['symbol']}-supercharger`.toLowerCase(),
            tvlUsd: parseFloat(BigNumber(info['tvl']).div(10 ** decimals)),
            apyBase: info['weighted_average_apr'],
            apyReward: info['x_woo_rewards_apr'],
            rewardTokens: [xWOOMapping[chain]],
          });
    }
  }

  return results;
};

module.exports = {
  timetravel: false,
  apy: main,
  url: 'https://fi.woo.org/earn/',
};
