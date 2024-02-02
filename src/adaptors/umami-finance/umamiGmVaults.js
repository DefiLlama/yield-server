const superagent = require('superagent');
const Web3 = require('web3');
const ethers = require('ethers');
const sdk = require('@defillama/sdk');

const {
  UMAMI_GM_VAULTS,
  ARB_MASTER_CHEF,
  ARB_ADDRESS,
  GMI_VAULT,
  GMI_AGGREGATE_VAULT,
} = require('./umamiConstants.js');
const { getGmMarketsForUmami } = require('./gmx-helpers.js');
const { ARB_MASTER_CHEF_ABI } = require('./abis/arbMasterchef.js');
const { GMI_VAULT_ABI } = require('./abis/gmiVault.js');
const { GMI_AGGREGATE_VAULT_ABI } = require('./abis/gmiAggregateVault.js');
const { GM_ASSET_VAULT_ABI } = require('./abis/gmAssetVault.js');

const RPC_URL = 'https://rpc.ankr.com/arbitrum';

const web3 = new Web3(RPC_URL);

const aggregateVaultContract = new web3.eth.Contract(
  GMI_AGGREGATE_VAULT_ABI,
  GMI_AGGREGATE_VAULT
);
const masterchefContract = new web3.eth.Contract(
  ARB_MASTER_CHEF_ABI,
  ARB_MASTER_CHEF
);
const gmiContract = new web3.eth.Contract(GMI_VAULT_ABI, GMI_VAULT);

// returns the balances of GMX GM tokens held in the GMI vault on behalf of the GM vaults (llamao)
const getGmiGmMarketsBalances = async () => {
  const balances = await gmiContract.methods.balances().call();

  return balances;
};

// ARB incentives through Masterchef
const getIncentivesAprForVault = async (vault) => {
  const vaultContract = new web3.eth.Contract(
    GM_ASSET_VAULT_ABI,
    vault.address
  );
  const underlyingTokenPriceKey =
    `arbitrum:${vault.underlyingAsset}`.toLowerCase();
  const arbTokenPriceKey = `arbitrum:${ARB_ADDRESS}`.toLowerCase();

  const [
    arbPerSecRaw,
    stakedBalanceRaw,
    vaultPpsRaw,
    underlyingTokenPriceObj,
    arbTokenPriceObj,
  ] = await Promise.all([
    masterchefContract.methods.arbPerSec().call(),
    vaultContract.methods.balanceOf(ARB_MASTER_CHEF).call(),
    aggregateVaultContract.methods
      .getVaultPPS(vault.address.toLowerCase(), true, false)
      .call(),
    superagent.get(
      `https://coins.llama.fi/prices/current/${underlyingTokenPriceKey}`
    ),
    superagent.get(`https://coins.llama.fi/prices/current/${arbTokenPriceKey}`),
  ]);

  const underlyingTokenPrice =
    underlyingTokenPriceObj.body.coins[underlyingTokenPriceKey].price;
  const arbTokenPrice = arbTokenPriceObj.body.coins[arbTokenPriceKey].price;

  const arbPerSec = arbPerSecRaw / 10 ** 18;
  const vaultPps = vaultPpsRaw / 10 ** vault.decimals;
  const assetsStakedTvl = Number(
    ethers.utils.formatUnits(stakedBalanceRaw, vault.decimals) * vaultPps
  );

  const emissionsPerYearInUsd =
    (arbPerSec * 60 * 60 * 24 * 365 * arbTokenPrice) / 2;
  const emissionsPerYearInTokens = emissionsPerYearInUsd / underlyingTokenPrice;

  const apr = (emissionsPerYearInTokens / assetsStakedTvl) * 100;

  return isNaN(apr) ? 0 : apr;
};

const getUmamiGmVaultsYield = async () => {
  const gmVaults = [];
  const [gmMarketsBalancesInGmi, gmMarketsInfos] = await Promise.all([
    getGmiGmMarketsBalances(),
    getGmMarketsForUmami(),
  ]);
  for (let i = 0; i < UMAMI_GM_VAULTS.length; i++) {
    const vault = UMAMI_GM_VAULTS[i];
    // get total value of GMX GM tokens
    const gmMarketsValues = await Promise.all(
      vault.underlyingGmMarkets.map((gmMarket, _index) => {
        const gmTokenPrice = gmMarketsInfos[_index].gmTokenPrice;
        const balanceValue = gmMarketsBalancesInGmi[_index] * gmTokenPrice;
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

    const [tvlRaw, underlyingTokenPriceObj, arbIncentivesApr, bufferRaw] =
      await Promise.all([
        aggregateVaultContract.methods
          .getVaultTVL(vault.address.toLowerCase(), false)
          .call(),
        superagent.get(
          `https://coins.llama.fi/prices/current/${underlyingTokenPriceKey}`
        ),
        getIncentivesAprForVault(vault),
        sdk.api.erc20.balanceOf({
          target: vault.underlyingAsset.toLowerCase(),
          owner: GMI_AGGREGATE_VAULT,
          chain: 'arbitrum',
        }),
      ]);

    const underlyingTokenPrice =
      underlyingTokenPriceObj.body.coins[underlyingTokenPriceKey].price;
    const tvl = tvlRaw / 10 ** vault.decimals;

    const buffer = bufferRaw.output / 10 ** vault.decimals;

    const bufferWeight = buffer / tvl;
    let vaultApr = gmMarketsAprs.reduce((acc, apr) => acc + apr, 0);
    vaultApr = vaultApr * (1 - bufferWeight);

    gmVaults.push({
      pool: vault.address,
      tvlUsd: +(tvl * underlyingTokenPrice),
      apyBase: +vaultApr.toFixed(2),
      apy: +vaultApr.toFixed(2),
      apyReward: +arbIncentivesApr.toFixed(2),
      symbol: vault.symbol,
      rewardTokens: [vault.underlyingAsset, ARB_ADDRESS],
      underlyingTokens: [vault.underlyingAsset],
      url: `https://umami.finance/vaults/gm/${vault.id}`,
    });
  }

  return gmVaults;
};

module.exports = {
  getUmamiGmVaultsYield,
};
