const BigNumber = require('bignumber.js');
const utils = require('../utils');

const API_URL = 'https://fi-api.woo.org/yield';
const STATS_API_URL = 'https://api.woofi.com/token_stat';

const API_URLS = {
  binance: `${API_URL}?network=bsc`,
  avalanche: `${API_URL}?network=avax`,
  fantom: `${API_URL}?network=fantom`,
  polygon: `${API_URL}?network=polygon`,
  arbitrum: `${API_URL}?network=arbitrum`,
  optimism: `${API_URL}?network=optimism`,
  era: `${API_URL}?network=zksync`,
  linea: `${API_URL}?network=linea`,
  base: `${API_URL}?network=base`,
  mantle: `${API_URL}?network=mantle`,
  sonic: `${API_URL}?network=sonic`,
  berachain: `${API_URL}?network=berachain`,
};

const rewardTokensMapping = {
  // binance: '0x4691937a7508860F876c9c0a2a617E7d9E945D4B', // WOO
  // avalanche: '0xaBC9547B534519fF73921b1FBA6E672b5f58D083', // WOO
  // fantom: '0x6626c47c00F1D87902fc13EECfaC3ed06D5E8D8a', // WOO
  // polygon: '0x1B815d120B3eF02039Ee11dC2d33DE7aA4a8C603', // WOO
  // arbitrum: '0xcAFcD85D8ca7Ad1e1C6F82F651fA15E33AEfD07b', // WOO
  // optimism: '0x871f2F2ff935FD1eD867842FF2a7bfD051A5E527', // WOO
  optimism: '0x4200000000000000000000000000000000000042', // OP
  // linea: '0xF3df0A31ec5EA438150987805e841F960b9471b6', // WOO
  // base: '0xF3df0A31ec5EA438150987805e841F960b9471b6', // WOO
  mantle: '0x78c1b0C915c4FAA5FffA6CAbf0219DA63d7f4cb8', // WMNT
  // sonic: '0xF3df0A31ec5EA438150987805e841F960b9471b6', // WOO
};

async function getStats() {
  const stats = {}
  for (const chain of Object.keys(API_URLS)) {
    let woofiChain = chain;
    if (chain === 'binance') woofiChain = 'bsc';
    if (chain === 'avalanche') woofiChain = 'avax';
    if (chain === 'era') woofiChain = 'zksync';

    // don't know why woofi api return bsc data key for all chains here
    stats[chain] = (await utils.getData(`${STATS_API_URL}?network=${woofiChain}`))['data']['bsc'];
  }
  return stats;
}

const main = async () => {
  const stats = await getStats()
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
      let apyReward;
      let rewardTokens;
      if (chain === "optimism" || chain === "mantle") {
        apyReward = info['reward_apr'];
        rewardTokens = [rewardTokensMapping[chain]];
      } else {
        apyReward = 0;
        rewardTokens = [];
      }

      let volumeUsd1d = 0;
      if (stats[chain]) {
        for (const token of stats[chain]) {
          if (token.symbol === info['symbol']) {
            volumeUsd1d = Number(token['24h_volume_usd']) / 1e18;
          }
        }
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
        volumeUsd1d: volumeUsd1d,
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
