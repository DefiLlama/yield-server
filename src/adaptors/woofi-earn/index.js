const BigNumber = require('bignumber.js');
const sdk = require('@defillama/sdk');
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

// Map internal chain names to SDK chain names
const chainMapping = {
  binance: 'bsc',
  avalanche: 'avax',
  era: 'zksync',
};

const rewardTokensMapping = {
  optimism: '0x4200000000000000000000000000000000000042', // OP
  mantle: '0x78c1b0C915c4FAA5FffA6CAbf0219DA63d7f4cb8', // WMNT
};

// Known underlying tokens for vaults where want() call fails
const KNOWN_UNDERLYING = {
  era: {
    '0x1d686250bbffa9fe120b591f5992dd7fc0fd99a4': ['0x5AEa5775959fBC2557Cc8789bC1bf90A239D9a91'], // WETH
    '0xdca324bdd4ebb6b8a1802959324ce125b5d57921': ['0x1d17CBcF0D6D143135aE902365D2E5e2A16538D4'], // USDC
    '0xa8bbab0ac88382a0f507b9e93cdbe65ffa1f50d1': ['0x3355df6D4c9C3035724Fd0e3914dE96A5a83aaf4'], // USDC.E
    '0x85167f7f3f367e0be7b4d3a8c2b1648f56dfdb45': ['0x5A7d6b2F92C77FAD6CCaBd7EE0624E64907Eaf3E'], // ZK
  },
};

// Fetch underlying token from vault using want() method
const getVaultUnderlying = async (vaultAddress, chain) => {
  const sdkChain = chainMapping[chain] || chain;
  try {
    const result = await sdk.api.abi.call({
      target: vaultAddress,
      abi: 'address:want',
      chain: sdkChain,
    });
    if (result.output && result.output !== '0x0000000000000000000000000000000000000000') {
      return [result.output];
    }
  } catch (e) {
    // Vault might not have want() method or call failed
  }
  // Fallback to known mapping
  const known = KNOWN_UNDERLYING[chain]?.[vaultAddress.toLowerCase()];
  if (known) return known;
  return undefined;
};

async function getStats() {
  const stats = {};
  for (const chain of Object.keys(API_URLS)) {
    let woofiChain = chain;
    if (chain === 'binance') woofiChain = 'bsc';
    if (chain === 'avalanche') woofiChain = 'avax';
    if (chain === 'era') woofiChain = 'zksync';

    try {
      stats[chain] = (await utils.getData(`${STATS_API_URL}?network=${woofiChain}`))['data']['bsc'];
    } catch (e) {
      stats[chain] = [];
    }
  }
  return stats;
}

const main = async () => {
  const stats = await getStats();
  const datas = await Promise.all(
    Object.entries(API_URLS).map(async ([chain, url]) => {
      try {
        const data = (await utils.getData(url))['data']['auto_compounding'];
        return [chain, data];
      } catch (e) {
        return [chain, {}];
      }
    })
  );

  let results = [];
  for (const [chain, data] of datas) {
    const poolEntries = Object.entries(data);

    // Fetch underlying tokens for all vaults in parallel
    const underlyingTokensMap = {};
    await Promise.all(
      poolEntries.map(async ([address, info]) => {
        if (info['source']?.indexOf('woofi_super_charger') !== -1) {
          underlyingTokensMap[address] = await getVaultUnderlying(address, chain);
        }
      })
    );

    for (const [address, info] of poolEntries) {
      let source = info['source'];
      if (source?.indexOf('woofi_super_charger') === -1) continue;

      let version = 'V1';
      if (source.split('_').length >= 4) {
        version = source.split('_')[3].toUpperCase();
      }

      let decimals = info['decimals'];
      let apyReward;
      let rewardTokens;
      if (chain === 'optimism' || chain === 'mantle') {
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
        underlyingTokens: underlyingTokensMap[address],
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
