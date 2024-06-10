const superagent = require('superagent');
const Web3 = require('web3');
const ethers = require('ethers');
const sdk = require('@defillama/sdk');

const {
  UMAMI_GM_VAULTS,
  ARB_MASTER_CHEF,
  ARB_ADDRESS,
  GM_AGGREGATE_VAULT_ADDRESS,
  GM_GMI_CONTRACT_ADDRESS,
} = require('./umamiConstants.js');
const { getGmMarketsForUmami } = require('./gmx-helpers.js');
const { ARB_MASTER_CHEF_ABI } = require('./abis/arbMasterchef.js');
const { GMI_VAULT_ABI } = require('./abis/gmiVault.js');
const { GMI_AGGREGATE_VAULT_ABI } = require('./abis/gmiAggregateVault.js');
const { GM_ASSET_VAULT_ABI } = require('./abis/gmAssetVault.js');

/** ---- GM VAULTS ---- */

const RPC_URL = 'https://rpc.ankr.com/arbitrum';

const web3 = new Web3(RPC_URL);

const aggregateVaultContract = new web3.eth.Contract(
  GMI_AGGREGATE_VAULT_ABI,
  GM_AGGREGATE_VAULT_ADDRESS
);
const masterchefContract = new web3.eth.Contract(
  ARB_MASTER_CHEF_ABI,
  ARB_MASTER_CHEF
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

// ARB incentives through Masterchef
const getIncentivesAprForVault = async (vault) => {
  const vaultContract = new web3.eth.Contract(
    GM_ASSET_VAULT_ABI,
    vault.address
  );
  const underlyingTokenPriceKey =
    `arbitrum:${vault.underlyingAsset}`.toLowerCase();
  const arbTokenPriceKey = `arbitrum:${ARB_ADDRESS}`.toLowerCase();

  const lpId = await masterchefContract.methods
    .getPIdFromLP(vault.address)
    .call();

  const [
    totalAllocPoint,
    arbPerSecRaw,
    poolInfos,
    stakedBalanceRaw,
    vaultPpsRaw,
    underlyingTokenPriceObj,
    arbTokenPriceObj,
  ] = await Promise.all([
    masterchefContract.methods.totalAllocPoint().call(),
    masterchefContract.methods.arbPerSec().call(),
    masterchefContract.methods.poolInfo(lpId).call(),
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
  const assetsStakedTvl =
    parseFloat(ethers.utils.formatUnits(stakedBalanceRaw, vault.decimals)) *
    vaultPps;

  const emissionsPerYearInUsd = arbPerSec * 60 * 60 * 24 * 365 * arbTokenPrice;
  const emissionsPerYearInTokens = emissionsPerYearInUsd / underlyingTokenPrice;

  const apr = (emissionsPerYearInTokens / assetsStakedTvl) * 100;

  return isNaN(apr) ? 0 : apr;
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

    const [tvlRaw, underlyingTokenPriceObj, bufferRaw] = await Promise.all([
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
    ]);

    const underlyingTokenPrice =
      underlyingTokenPriceObj.body.coins[underlyingTokenPriceKey].price;
    const tvl = tvlRaw / 10 ** vault.decimals;

    const buffer = bufferRaw.output / 10 ** vault.decimals;

    const bufferWeight = buffer / tvl;
    const vaultApr = gmMarketsApr;

    gmVaults.push({
      pool: vault.address,
      tvlUsd: +(tvl * underlyingTokenPrice),
      apyBase: +vaultApr.toFixed(2),
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
