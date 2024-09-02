const BigNumber = require('bignumber.js');
const utils = require('../utils');

const API_URL = 'https://fi-api.woo.org/yield';

const API_URLS = {
  binance: `${API_URL}?network=bsc`,
  avalanche: `${API_URL}?network=avax`,
  fantom: `${API_URL}?network=fantom`,
  polygon: `${API_URL}?network=polygon`,
  arbitrum: `${API_URL}?network=arbitrum`,
  optimism: `${API_URL}?network=optimism`,
  era: `${API_URL}?network=zksync`,
  base: `${API_URL}?network=base`,
};

const rewardTokensMapping = {
  binance: '0x4691937a7508860F876c9c0a2a617E7d9E945D4B', // WOO
  avalanche: '0xaBC9547B534519fF73921b1FBA6E672b5f58D083', // WOO
  fantom: '0x6626c47c00F1D87902fc13EECfaC3ed06D5E8D8a', // WOO
  polygon: '0x1B815d120B3eF02039Ee11dC2d33DE7aA4a8C603', // WOO
  arbitrum: '0x912CE59144191C1204E64559FE8253a0e49E6548', // ARB
  optimism: '0x871f2F2ff935FD1eD867842FF2a7bfD051A5E527', // WOO
};

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
      let source = info['source'];
      if (source.indexOf('woofi_super_charger') === -1) continue;

      let version = 'V1';
      if (source.split('_').length >= 4) {
        version = source.split('_')[3].toUpperCase();
      }

      let decimals = info['decimals'];
      let apyReward = info['woo_rewards_apr'];
      if (chain === "arbitrum") {
        apyReward = info['arb_rewards_apr'];
      }
      let rewardTokens;
      if (chain === "era" || chain === "base") {
        rewardTokens = [];
      } else {
        rewardTokens = [rewardTokensMapping[chain]];
      }
      results.push({
        pool: `${address}-${chain}`.toLowerCase(),
        chain: utils.formatChain(chain),
        project: 'woofi-earn',
        symbol: utils.formatSymbol(info['symbol']),
        poolMeta: `Supercharger${version}`,
        tvlUsd: parseFloat(BigNumber(info['tvl']).div(10 ** decimals)),
        apyBase: info['weighted_average_apr'],
        apyReward: apyReward,
        rewardTokens: rewardTokens,
      });
    }
  }

  return results;
};

module.exports = {
  timetravel: false,
  apy: main,
  url: 'https://fi.woo.org/swap/earn',
};
