const superagent = require('superagent');
const { Web3 } = require('web3');
const sdk = require('@defillama/sdk');

const arbitrumConstants = require('./arbitrum/umamiConstants.js');
const avalancheConstants = require('./avalanche/umamiConstants.js');

const { getIncentivesAprForVault } = require('./umamiIncentivesHelper.js');
const {
  getUmamiContractsForChain,
  getAggregateVaultContractForVault,
} = require('./umamiContracts.js');

/** ---- GM VAULTS ---- */

const getUmamiGmVaultsYield = async (chain, gmMarketsInfos) => {
  const gmVaults = [];

  const vaultsList =
    chain === 'arbitrum'
      ? arbitrumConstants.UMAMI_GM_VAULTS
      : avalancheConstants.UMAMI_GM_VAULTS;

  const rewardToken =
    chain === 'arbitrum'
      ? arbitrumConstants.REWARD_TOKEN_ADDRESS
      : avalancheConstants.REWARD_TOKEN_ADDRESS;

  for (let i = 0; i < vaultsList.length; i++) {
    const vault = vaultsList[i];
    const aggregateVaultContract = getAggregateVaultContractForVault(
      chain,
      vault.aggregateVaultAddress
    );
    // get aprs out of GM markets
    const gmMarket = gmMarketsInfos.find(
      (market) =>
        market.pool.toLowerCase() ===
        vault.underlyingGmMarkets[0].address.toLowerCase()
    );

    const underlyingTokenPriceKey =
      `${chain}:${vault.underlyingAsset}`.toLowerCase();

    const [tvlRaw, underlyingTokenPriceObj] = await Promise.all([
      aggregateVaultContract.methods
        .getVaultTVL(vault.address.toLowerCase(), false)
        .call(),
      superagent.get(
        `https://coins.llama.fi/prices/current/${underlyingTokenPriceKey}`
      ),
      ,
    ]);

    const underlyingTokenPrice =
      underlyingTokenPriceObj.body.coins[underlyingTokenPriceKey].price;
    const tvl = Number(tvlRaw) / 10 ** vault.decimals;

    let vaultObject = {
      pool: vault.address,
      tvlUsd: +(tvl * underlyingTokenPrice),
      apyBase: +Number(gmMarket.apyBase).toFixed(2),
      symbol: vault.symbol,
      underlyingTokens: [vault.underlyingAsset],
      url: vault.url,
    };

    if (rewardToken) {
      const vaultIncentivesApr = await getIncentivesAprForVault(vault, chain);

      vaultObject = {
        ...vaultObject,
        apyReward: +vaultIncentivesApr.toFixed(2),
        rewardTokens: [rewardToken],
      };
    }

    gmVaults.push(vaultObject);
  }

  return gmVaults;
};

module.exports = {
  getUmamiGmVaultsYield,
};
