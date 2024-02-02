const superagent = require('superagent');
const Web3 = require('web3');

const { UMAMI_GLP_VAULTS, UMAMI_API_URL } = require('./umamiConstants.js');
const { GLP_ASSET_VAULT_ABI } = require('./abis/glpAssetVault.js');

const RPC_URL = 'https://rpc.ankr.com/arbitrum';

const web3 = new Web3(RPC_URL);

const getUmamiGlpVaultsYield = async () => {
  const vaults = [];
  await Promise.all(
    UMAMI_GLP_VAULTS.map(async (vault) => {
      const vaultContract = new web3.eth.Contract(
        GLP_ASSET_VAULT_ABI,
        vault.address
      );
      const underlyingTokenPriceKey =
        `arbitrum:${vault.underlyingAsset}`.toLowerCase();

      const [tvlRaw, vaultFromApiObj, underlyingTokenPriceObj] =
        await Promise.all([
          vaultContract.methods.tvl().call(),
          superagent.get(`${UMAMI_API_URL}/vaults/${vault.id}`),
          superagent.get(
            `https://coins.llama.fi/prices/current/${underlyingTokenPriceKey}`
          ),
        ]);
      const tvl = tvlRaw / 10 ** vault.decimals;
      const vaultFromApi = vaultFromApiObj.body;

      const underlyingTokenPrice =
        underlyingTokenPriceObj.body.coins[underlyingTokenPriceKey].price;

      vaults.push({
        pool: vault.address,
        tvlUsd: +(tvl * underlyingTokenPrice),
        apyBase: +(vaultFromApi.liquidApr * 100).toFixed(2),
        symbol: vault.symbol,
        rewardTokens: [vault.underlyingAsset],
        underlyingTokens: [vault.underlyingAsset],
        url: `https://umami.finance/vaults/${vault.id}`,
      });
    })
  );

  return vaults;
};

module.exports = {
  getUmamiGlpVaultsYield,
};
