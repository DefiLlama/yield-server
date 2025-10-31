const axios = require('axios');
const utils = require('../utils');
const sdk = require('@defillama/sdk');

const vaultsApi = 'https://lendle-vaults-api-184110952121.europe-west4.run.app';
const vaultsApy = `${vaultsApi}/apy/breakdown`;
const vaultsData = `${vaultsApi}/vaults`;

const vaultList = [
  "0x25ddfB3831b5a1099932E4cA9CD2Ea9cB6665F1B",
  "0x32294e130181F31c6286B4B5AaA3697f538C3Bd7",
  "0x3ad7d10085C7243a19c6589056A58EB94334CB52",
  "0x43703b0FD253e1172A0F18e65d097bd7b120B7bf",
  "0x4606E0fED3Daa8D175274103e37C070dA70C53F4",
  "0x4fD28eabb44474aF1da36c7c4ea5441616D98076",
  "0xB2Be0a666d4c34ded06242178E8138F7CEc72100",
  "0xB761673116D7B1840CB94bbF7Adb673b4F4a18b4",
  "0xD1d9C7be232920BFD971b2F3B83b1C5EFe4B15d8",
  "0xD1FC69F097141189A4d46ee84E11992e6be87Cae",
  "0xeB244CC3Fc3C3ca391D453def40CF78eaf3B7373",
];

const vaultsCampaignApi = 'https://api.merkl.xyz/v4/opportunities?name=lendle';

const chains = {
  'mantle': {
    chainId: 5000,
  },
};

const abis = {
  want: "function want() view returns (address)",
  balance: "function balance() external view returns (uint256)",
};

const getApy = async () => {
  const vaults = await Promise.all(
    Object.keys(chains).map(async (chain) => {
      const chainId = chains[chain].chainId;

      const _vaultsData = (await axios.get(vaultsData)).data;

      const calls = vaultList.map((vault) => ({ target: vault }));
      const wants = await sdk.api.abi.multiCall({ abi: abis.want, calls, chain });
      const balances = await sdk.api.abi.multiCall({ abi: abis.balance, calls, chain });
      const { pricesByAddress: prices } = await utils.getPrices(
        wants.output.map(({ output }) => output),
        chain
      );

      const _vaultsApy = (await axios.get(vaultsApy)).data;

      const _vaultsCampaignApi = (await axios.get(vaultsCampaignApi)).data;

      return vaultList.map((t, i) => {
        const config = _vaultsData.find(
          (vault) => vault.earnContractAddress === t
        );
        if (!config || config.status !== 'active') return null;

        const want = wants.output[i].output;
        const balance = balances.output[i].output;
        const price = prices[want.toLowerCase()];
        const tvlUsd = price * (balance / 10 ** config.tokenDecimals);

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
          pool: `${t}-${chain}-lendle-earn`.toLowerCase(),
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
