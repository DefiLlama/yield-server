const axios = require('axios');
const sdk = require('@defillama/sdk');
const { formatChain, keepFinite } = require('../utils.js');

const vaultAbi = require('./vaultAbi.json');

const ADDRESSES = {
  ethereum: {
    vaultRegistry: '0x007318Dc89B314b47609C684260CfbfbcD412864',
    gaugeController: '0xD57d8EEC36F0Ba7D8Fd693B9D97e02D8353EB1F4',
    oVCX: '0xaFa52E3860b4371ab9d8F08E801E9EA1027C0CA2',
  },
  arbitrum: {
    vaultRegistry: '0xB205e94D402742B919E851892f7d515592a7A6cC',
    oVCX: '0x59a696bF34Eae5AD8Fd472020e3Bed410694a230',
  },
  polygon: {
    vaultRegistry: '0x2246c4c469735bCE95C120939b0C078EC37A08D0',
  },
  bsc: {
    vaultRegistry: '0x25172C73958064f9ABc757ffc63EB859D7dc2219',
  },
  optimism: {
    vaultRegistry: '0xdD0d135b5b52B7EDd90a83d4A4112C55a1A6D23A',
    oVCX: '0xD41d34d6b50785fDC025caD971fE940B8AA1bE45',
  },
};

const CHAIN_TO_ID = {
  ethereum: 1,
  optimism: 10,
  polygon: 137,
  arbitrum: 42161,
  base: 8453,
  avax: 43114,
  fraxtal: 252,
  bsc: 56,
};

// returns a list of vaults, see https://github.com/Popcorn-Limited/defi-db/blob/main/archive/vaults/1.json
// for schema
const getVaults = async (chainID) => {
  const vaults = (
    await axios.get(`https://app.vaultcraft.io/api/vaults?chainId=${chainID}`)
  ).data;
  return Object.values(vaults);
};

async function getTokenPrice(chain, token) {
  const { data } = await axios.get(
    `https://coins.llama.fi/prices/current/${chain}:${token}`
  );
  return data.coins[`${chain}:${token}`]?.price;
}

const apy = async (timestamp = null) => {
  const yieldData = [];
  const chainEntries = Object.entries(CHAIN_TO_ID);

  const chainResults = await Promise.allSettled(
    chainEntries.map(([chain, chainId]) =>
      (async () => {
        const chainYieldData = [];
        const vaults = await getVaults(chainId);

        for (const vault of vaults) {
          if (!vault.baseApy) {
            // no apy
            continue;
          }
          if (vault?.address === undefined || vault?.asset === undefined) {
            continue;
          }

          try {
            const symbol = (
              await sdk.api.abi.call({
                target: vault.address,
                abi: vaultAbi.find((n) => n.name === 'symbol'),
                chain,
              })
            ).output.replace('pop-', '');

            const totalAssets = (
              await sdk.api.abi.call({
                target: vault.address,
                abi: vaultAbi.find((n) => n.name === 'totalAssets'),
                chain,
              })
            ).output;

            const price = await getTokenPrice(chain, vault.asset.address);
            if (!price) {
              continue;
            }

            const tvl = (totalAssets * price) / 10 ** vault.asset.decimals;

            const data = {
              pool: `${vault.address}-${chain}`,
              chain: formatChain(chain),
              project: 'vaultcraft',
              symbol,
              tvlUsd: tvl,
              apyBase: vault.baseApy,
              underlyingTokens: [vault.asset.address],
            };

            if (vault.gaugeLowerApr && ADDRESSES[chain]?.oVCX) {
              data.apyReward = vault.gaugeLowerApr;
              data.rewardTokens = [ADDRESSES[chain].oVCX];
            }
            chainYieldData.push(data);
          } catch (vaultError) {
            console.error(
              `vaultcraft: failed to load vault ${vault.address} on ${chain}`,
              vaultError?.message || vaultError
            );
          }
        }

        return chainYieldData;
      })()
    )
  );

  chainResults.forEach((result, index) => {
    const [chain] = chainEntries[index];
    if (result.status === 'fulfilled') {
      yieldData.push(...result.value);
    } else {
      console.error(
        `vaultcraft: failed to load vaults for chain ${chain}`,
        result.reason?.message || result.reason
      );
    }
  });

  return yieldData.filter((p) => keepFinite(p));
};

module.exports = {
  apy,
  url: 'https://app.vaultcraft.io/vaults',
};
