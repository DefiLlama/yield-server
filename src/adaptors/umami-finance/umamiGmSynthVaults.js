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
const { default: BigNumber } = require('bignumber.js');
const { formatUnits } = require('ethers/lib/utils.js');

// returns the weights of GMX GM tokens held in the GMI vault
const getGmiGmMarketsWeights = async (gmiContract) => {
  const weights = await gmiContract.methods.getWeights().call();

  return weights.map((weight) => parseFloat(formatUnits(BigInt(weight), 18)));
};

const getUmamiGmSynthsVaultsYield = async (chain, gmMarketsInfos) => {
  const gmVaults = [];
  const vaultsList =
    chain === 'arbitrum'
      ? arbitrumConstants.UMAMI_SYNTH_GM_VAULTS
      : avalancheConstants.UMAMI_SYNTH_GM_VAULTS;

  const rewardToken =
    chain === 'arbitrum'
      ? arbitrumConstants.REWARD_TOKEN_ADDRESS
      : avalancheConstants.REWARD_TOKEN_ADDRESS;

  const coreContracts = getUmamiContractsForChain(chain);

  const weights = await getGmiGmMarketsWeights(coreContracts.gmiContract);

  for (let i = 0; i < vaultsList.length; i++) {
    const vault = vaultsList[i];
    const aggregateVaultContract = getAggregateVaultContractForVault(
      chain,
      vault.aggregateVaultAddress
    );

    // get aprs out of GM markets
    const gmMarketsAprs = vault.underlyingGmMarkets.map((gmMarket, _index) => {
      const gmMarketYieldInfos = gmMarketsInfos.find(
        (market) => market.pool.toLowerCase() === gmMarket.address.toLowerCase()
      );
      if (!gmMarketYieldInfos) {
        return 0;
      }
      const gmMarketApr = gmMarketsInfos[_index].apyBase;
      const gmMarketWeight = weights[_index];
      return gmMarketApr * gmMarketWeight;
    });

    const underlyingTokenPriceKey =
      `${chain}:${vault.underlyingAsset}`.toLowerCase();

    const [tvlRaw, underlyingTokenPriceObj] = await Promise.all([
      aggregateVaultContract.methods
        .getVaultTVL(vault.address.toLowerCase(), false)
        .call(),
      superagent.get(
        `https://coins.llama.fi/prices/current/${underlyingTokenPriceKey}`
      ),
    ]);

    const underlyingTokenPrice =
      underlyingTokenPriceObj.body.coins[underlyingTokenPriceKey].price;
    const tvl = Number(tvlRaw) / 10 ** vault.decimals;

    const vaultApr = gmMarketsAprs.reduce((acc, apr) => acc + Number(apr), 0);

    let vaultObject = {
      pool: vault.address,
      tvlUsd: +(tvl * underlyingTokenPrice),
      apyBase: +vaultApr.toFixed(2),
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
  getUmamiGmSynthsVaultsYield,
};
