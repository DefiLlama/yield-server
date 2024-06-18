const axios = require('axios');
const sdk = require('@defillama/sdk5');
const { formatChain, keepFinite } = require('../utils.js');

const vaultAbi = require('./vaultAbi.json');

const ADDRESSES = {
  ethereum: {
    vaultRegistry: '0x007318Dc89B314b47609C684260CfbfbcD412864',
    gaugeController: '0xD57d8EEC36F0Ba7D8Fd693B9D97e02D8353EB1F4',
  },
  arbitrum: {
    vaultRegistry: '0xB205e94D402742B919E851892f7d515592a7A6cC',
  },
  polygon: {
    vaultRegistry: '0x2246c4c469735bCE95C120939b0C078EC37A08D0',
  },
  bsc: {
    vaultRegistry: '0x25172C73958064f9ABc757ffc63EB859D7dc2219',
  },
  optimism: {
    vaultRegistry: '0xdD0d135b5b52B7EDd90a83d4A4112C55a1A6D23A',
  },
};

const oVCX = '0xaFa52E3860b4371ab9d8F08E801E9EA1027C0CA2';

const CHAIN_TO_ID = {
  ethereum: 1,
  optimism: 10,
  polygon: 137,
  arbitrum: 42161,
  bsc: 56,
};

// returns a list of vaults, see https://github.com/Popcorn-Limited/defi-db/blob/main/archive/vaults/1.json
// for schema
const getVaults = async (chainID) => {
  const { data } = await axios.get(
    `https://raw.githubusercontent.com/Popcorn-Limited/defi-db/main/archive/vaults/${chainID}.json`
  );
  return Object.values(data);
};

// returns undefined if it can't find the given strategy
const getStrategyResolver = async (chainID, strategyAddress) => {
  const { data } = await axios.get(
    `https://raw.githubusercontent.com/Popcorn-Limited/defi-db/main/archive/descriptions/strategies/${chainID}.json`
  );
  return data[strategyAddress]?.resolver;
};

const getBaseApy = (stratApys, chainId, resolver, asset) => {
  return stratApys[chainId]?.[resolver]?.[asset]?.total;
};

const getStratApys = async () => {
  const { data } = await axios.get(
    'https://raw.githubusercontent.com/Popcorn-Limited/defi-db/main/apy-data.json'
  );
  return data;
};

const getGaugeApys = async () => {
  const { data } = await axios.get(
    'https://raw.githubusercontent.com/Popcorn-Limited/defi-db/main/gauge-apy-data.json'
  );
  return data;
};

async function getTokenPrice(chain, token) {
  const { data } = await axios.get(
    `https://coins.llama.fi/prices/current/${chain}:${token}`
  );
  return data.coins[`${chain}:${token}`]?.price;
}

const apy = async (timestamp = null) => {
  const yieldData = [];
  const gaugeApys = await getGaugeApys();
  const stratApys = await getStratApys();
  for (const [chain, chainId] of Object.entries(CHAIN_TO_ID)) {
    const vaults = await getVaults(chainId);
    for (const vault of vaults) {
      const strategyResolver = await getStrategyResolver(
        chainId,
        vault.strategies[0]
      );
      const apyBase = getBaseApy(
        stratApys,
        chainId,
        strategyResolver,
        vault.assetAddress
      );
      if (!apyBase) {
        // no apy
        continue;
      }

      const symbol = (
        await sdk.api.abi.call({
          target: vault.address,
          abi: vaultAbi.find((n) => n.name === 'symbol'),
          chain,
        })
      ).output.replace('pop-', '');

      const decimals = (
        await sdk.api.abi.call({
          target: vault.assetAddress,
          abi: 'erc20:decimals',
          chain,
        })
      ).output;

      const totalAssets = (
        await sdk.api.abi.call({
          target: vault.address,
          abi: vaultAbi.find((n) => n.name === 'totalAssets'),
          chain,
        })
      ).output;

      const tvl =
        (totalAssets * (await getTokenPrice(chain, vault.assetAddress))) /
        10 ** decimals;

      const data = {
        pool: `${vault.address}-${chain}`,
        chain: formatChain(chain),
        project: 'vaultcraft',
        symbol,
        tvlUsd: tvl,
        apyBase: apyBase,
        underlyingTokens: [vault.assetAddress],
        poolMeta: strategyResolver,
      };

      if (chain === 'ethereum') {
        const gaugeData = Object.values(gaugeApys).find(
          (gauge) => gauge.vault === vault.address
        );
        if (gaugeData) {
          data.apyReward = gaugeData.lowerAPR;
          data.rewardTokens = [oVCX];
        }
      }
      yieldData.push(data);
    }
  }
  return yieldData.filter((p) => keepFinite(p));
};

module.exports = {
  timetravel: false,
  apy,
  url: 'https://app.vaultcraft.io/vaults',
};
