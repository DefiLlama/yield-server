const axios = require('axios');
const utils = require('../utils');

const vaultsApi = 'https://lendle-vaults-api-184110952121.europe-west4.run.app';
const vaultsApy = `${vaultsApi}/apy/breakdown`;
const vaultsTvl = `${vaultsApi}/tvl`;
const vaultsData = `${vaultsApi}/vaults`;

const vaultsCampaignApi = 'https://api.merkl.xyz/v4/opportunities?name=lendle';

const chains = {
  mantle: {
    chainId: 5000,
  },
};

const getApy = async () => {
  const vaults = await Promise.all(
    Object.keys(chains).map(async (chain) => {
      const chainId = chains[chain].chainId;

      const _vaultsData = (await axios.get(vaultsData)).data;
      const vaultsList = _vaultsData
        .filter((vault) => vault.id.startsWith('lendle-'))
        .map((vault) => vault.earnContractAddress);

      const _vaultsTvl = (await axios.get(vaultsTvl)).data;
      const _vaultsApy = (await axios.get(vaultsApy)).data;

      const _vaultsCampaignApi = (await axios.get(vaultsCampaignApi)).data;

      return vaultsList.map((t, i) => {
        const config = _vaultsData.find(
          (vault) => vault.earnContractAddress === t
        );
        if (!config || config.status !== 'active') return null;

        const tvlUsd = _vaultsTvl[chainId][config.id];

        const apyBase = _vaultsApy[config.id]?.totalApy * 100 || 0;

        const aprData = _vaultsCampaignApi.find(
          (item) =>
            item.status === 'LIVE' &&
            item.identifier.toLowerCase() === t.toLowerCase() &&
            item.rewardsRecord.breakdowns[0].token.address !==
              '0x0000000000000000000000000000000000000000'
        );
        const apyReward = aprData ? aprData.apr : 0;

        const url = `https://app.lendle.xyz/vault/${config.id}`;

        return {
          pool: `${t}-${chain}`.toLowerCase(),
          symbol: config.name,
          project: 'lendle-earn',
          chain,
          tvlUsd,
          apyBase,
          apyReward,
          underlyingTokens: [config.tokenAddress],
          rewardTokens:
            aprData && apyReward
              ? ['0x78c1b0C915c4FAA5FffA6CAbf0219DA63d7f4cb8']
              : ['0x0000000000000000000000000000000000000000'],
          url,
          poolMeta: 'Vault',
        };
      });
    })
  );

  return vaults.flat().filter((p) => utils.keepFinite(p));
};

module.exports = {
  apy: getApy,
};
