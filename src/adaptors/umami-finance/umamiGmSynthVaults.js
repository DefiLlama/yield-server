const superagent = require('superagent');
const { Web3 } = require('web3');
const sdk = require('@defillama/sdk');

const {
  UMAMI_SYNTH_GM_VAULTS,
  ARB_ADDRESS,
  GMI_VAULT,
  GMI_AGGREGATE_VAULT,
} = require('./umamiConstants.js');
const { GMI_VAULT_ABI } = require('./abis/gmiVault.js');
const { GMI_AGGREGATE_VAULT_ABI } = require('./abis/gmiAggregateVault.js');
const { getGmMarketsForUmami } = require('./gmxHelpers.js');
const { getIncentivesAprForVault } = require('./umamiIncentivesHelper.js');

const RPC_URL = 'https://rpc.ankr.com/arbitrum';

const web3 = new Web3(RPC_URL);

const aggregateVaultContract = new web3.eth.Contract(
  GMI_AGGREGATE_VAULT_ABI,
  GMI_AGGREGATE_VAULT
);
const gmiContract = new web3.eth.Contract(GMI_VAULT_ABI, GMI_VAULT);

// returns the balances of GMX GM tokens held in the GMI vault on behalf of the GM vaults (llamao)
const getGmiGmMarketsBalances = async () => {
  const balances = await gmiContract.methods.balances().call();

  return balances;
};

const getUmamiGmSynthsVaultsYield = async () => {
  const gmVaults = [];
  const [gmMarketsBalancesInGmi, gmMarketsInfos] = await Promise.all([
    getGmiGmMarketsBalances(),
    getGmMarketsForUmami(),
  ]);
  for (let i = 0; i < UMAMI_SYNTH_GM_VAULTS.length; i++) {
    const vault = UMAMI_SYNTH_GM_VAULTS[i];
    // get total value of GMX GM tokens
    const gmMarketsValues = await Promise.all(
      vault.underlyingGmMarkets.map((gmMarket, _index) => {
        const gmTokenPrice = gmMarketsInfos[_index].gmTokenPrice;
        const balanceValue =
          Number(gmMarketsBalancesInGmi[_index]) * gmTokenPrice;
        if (balanceValue) {
          return balanceValue;
        }
        return 0;
      })
    );

    // get weights out of values
    const totalValue = gmMarketsValues.reduce((acc, value) => acc + value, 0);
    const weights = gmMarketsValues.map((value) => value / totalValue);

    // get aprs out of GM markets
    const gmMarketsAprs = vault.underlyingGmMarkets.map((gmMarket, _index) => {
      const gmMarketApr = gmMarketsInfos[_index].apyBase;
      const gmMarketWeight = weights[_index];
      return (gmMarketApr || 0) * gmMarketWeight;
    });

    const underlyingTokenPriceKey =
      `arbitrum:${vault.underlyingAsset}`.toLowerCase();

    const [tvlRaw, underlyingTokenPriceObj, bufferRaw, vaultIncentivesApr] =
      await Promise.all([
        aggregateVaultContract.methods
          .getVaultTVL(vault.address.toLowerCase(), false)
          .call(),
        superagent.get(
          `https://coins.llama.fi/prices/current/${underlyingTokenPriceKey}`
        ),
        sdk.api.erc20.balanceOf({
          target: vault.underlyingAsset.toLowerCase(),
          owner: GMI_AGGREGATE_VAULT,
          chain: 'arbitrum',
        }),
        getIncentivesAprForVault(vault),
      ]);

    const underlyingTokenPrice =
      underlyingTokenPriceObj.body.coins[underlyingTokenPriceKey].price;
    const tvl = Number(tvlRaw) / 10 ** vault.decimals;

    const buffer = bufferRaw.output / 10 ** vault.decimals;

    const bufferWeight = buffer / tvl;
    let vaultApr = gmMarketsAprs.reduce((acc, apr) => acc + apr, 0);
    vaultApr = vaultApr * (1 - bufferWeight);

    gmVaults.push({
      pool: vault.address,
      tvlUsd: +(tvl * underlyingTokenPrice),
      apyBase: +vaultApr.toFixed(2),
      apyReward: +vaultIncentivesApr.toFixed(2),
      rewardTokens: [ARB_ADDRESS],
      symbol: vault.symbol,
      underlyingTokens: [vault.underlyingAsset],
      url: `https://umami.finance/vaults/gm/${vault.id}`,
    });
  }

  return gmVaults;
};

module.exports = {
  getUmamiGmSynthsVaultsYield,
};
