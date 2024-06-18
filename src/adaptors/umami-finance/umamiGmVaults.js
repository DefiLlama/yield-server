const superagent = require('superagent');
const { Web3 } = require('web3');
const sdk = require('@defillama/sdk');

const {
  UMAMI_GM_VAULTS,
  ARB_ADDRESS,
  GM_AGGREGATE_VAULT_ADDRESS,
  GM_GMI_CONTRACT_ADDRESS,
} = require('./umamiConstants.js');
const { GMI_VAULT_ABI } = require('./abis/gmiVault.js');
const { GMI_AGGREGATE_VAULT_ABI } = require('./abis/gmiAggregateVault.js');
const { getGmMarketsForUmami } = require('./gmxHelpers.js');
const { getIncentivesAprForVault } = require('./umamiIncentivesHelper.js');

/** ---- GM VAULTS ---- */

const RPC_URL = 'https://rpc.ankr.com/arbitrum';

const web3 = new Web3(RPC_URL);

const aggregateVaultContract = new web3.eth.Contract(
  GMI_AGGREGATE_VAULT_ABI,
  GM_AGGREGATE_VAULT_ADDRESS
);
const gmiContract = new web3.eth.Contract(
  GMI_VAULT_ABI,
  GM_GMI_CONTRACT_ADDRESS
);

// returns the balances of GMX GM tokens held in the GMI vault on behalf of the GM vaults (llamao)
const getGmiGmMarketsBalances = async () => {
  const balances = await gmiContract.methods.balances().call();

  return balances;
};

const getUmamiGmVaultsYield = async () => {
  const gmVaults = [];
  const gmMarketsInfos = await getGmMarketsForUmami();
  for (let i = 0; i < UMAMI_GM_VAULTS.length; i++) {
    const vault = UMAMI_GM_VAULTS[i];

    // get aprs out of GM markets
    const gmMarket = gmMarketsInfos.find(
      (gmMarket) => gmMarket.pool === vault.underlyingGmMarkets[0]
    );
    const gmMarketsApr = gmMarket.apyBase;

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
          owner: GM_AGGREGATE_VAULT_ADDRESS,
          chain: 'arbitrum',
        }),
        getIncentivesAprForVault(vault),
      ]);

    const underlyingTokenPrice =
      underlyingTokenPriceObj.body.coins[underlyingTokenPriceKey].price;
    const tvl = Number(tvlRaw) / 10 ** vault.decimals;

    const buffer = bufferRaw.output / 10 ** vault.decimals;

    const bufferWeight = buffer / tvl;
    const vaultApr = gmMarketsApr;

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
  getUmamiGmVaultsYield,
};
