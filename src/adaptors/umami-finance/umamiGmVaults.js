const superagent = require('superagent');
const Web3 = require('web3');

const {
  UMAMI_GM_VAULTS,
  UMAMI_API_URL,
  ARB_MASTER_CHEF,
  ARB_ADDRESS,
  GMI_VAULT,
} = require('./umamiConstants.js');
const { getGmMarketsForUmami } = require('./gmx-helpers.js');
const { ARB_MASTER_CHEF_ABI } = require('./abis/arbMasterchef.js');
const { ABI: GMI_VAULT_ABI } = require('./abis/gmiVault.js');
const vaultAbi = require('./abis/glpVault.js');

const RPC_URL = 'https://arb-mainnet-public.unifra.io';

const web3 = new Web3(RPC_URL);

// returns the balances of GMX GM tokens held in the GMI vault on behalf of the GM vaults (llamao)
const getGmiGmMarketsBalances = async () => {
  const gmiContract = new web3.eth.Contract(GMI_VAULT_ABI, GMI_VAULT);
  const balances = await gmiContract.methods.balances().call();

  return balances;
};

// ARB incentives through Masterchef
const getIncentivesAprForVault = async (vault) => {
  const masterchefContract = new web3.eth.Contract(
    ARB_MASTER_CHEF_ABI,
    ARB_MASTER_CHEF
  );
  const vaultContract = new web3.eth.Contract(vaultAbi, vault.address);

  const underlyingTokenPriceKey =
    `arbitrum:${vault.underlyingAsset}`.toLowerCase();
  const arbTokenPriceKey = `arbitrum:${ARB_ADDRESS}`.toLowerCase();

  const [
    arbPerSecRaw,
    totalAllocPoint,
    pid,
    stakedBalance,
    vaultPpsRaw,
    underlyingTokenPriceObj,
    arbTokenPriceObj,
  ] = await Promise.all([
    masterchefContract.methods.arbPerSec().call(),
    masterchefContract.methods.totalAllocPoint().call(),
    masterchefContract.methods.getPIdFromLP(vault.address.toLowerCase()).call(),
    vaultContract.methods.balanceOf(ARB_MASTER_CHEF).call(),
    vaultContract.methods.pps().call(),
    superagent.get(
      `https://coins.llama.fi/prices/current/${underlyingTokenPriceKey}`
    ),
    superagent.get(`https://coins.llama.fi/prices/current/${arbTokenPriceKey}`),
  ]);

  const underlyingTokenPrice =
    underlyingTokenPriceObj.body.coins[underlyingTokenPriceKey].price;
  const arbTokenPrice = arbTokenPriceObj.body.coins[arbTokenPriceKey].price;
  const poolInfos = await masterchefContract.methods.poolInfo(pid).call();

  const poolAllocPoint = poolInfos[1];
  const arbPerSec = arbPerSecRaw / 10 ** 18;
  const vaultPps = vaultPpsRaw / 10 ** vault.decimals;

  const assetsStakedTvl = stakedBalance * vaultPps;
  const assetsStakedTvlUsd = assetsStakedTvl * underlyingTokenPrice;
  const arbPerSecondForVault = (arbPerSec * poolAllocPoint) / totalAllocPoint;
  const apr =
    (arbPerSecondForVault * 31536000 * arbTokenPrice) / assetsStakedTvlUsd;

  return isNaN(apr) ? 0 : apr;
};

const getUmamiGmVaultsYield = async () => {
  const gmVaults = [];
  const [gmMarketsBalancesInGmi, gmMarketsInfos] = await Promise.all([
    getGmiGmMarketsBalances(),
    getGmMarketsForUmami(),
  ]);

  await Promise.all(
    UMAMI_GM_VAULTS.map(async (vault) => {
      const vaultContract = new web3.eth.Contract(vaultAbi, vault.address);

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
      const gmMarketsAprs = vault.underlyingGmMarkets.map(
        (gmMarket, _index) => {
          const gmMarketApr = gmMarketsInfos[_index].apyBase;
          const gmMarketWeight = weights[_index];
          return (gmMarketApr || 0) * gmMarketWeight;
        }
      );

      const vaultApr = gmMarketsAprs.reduce((acc, apr) => acc + apr, 0);

      const underlyingTokenPriceKey =
        `arbitrum:${vault.underlyingAsset}`.toLowerCase();

      const [tvlRaw, underlyingTokenPriceObj, arbIncentivesApr] =
        await Promise.all([
          vaultContract.methods.totalAssets().call(),
          superagent.get(
            `https://coins.llama.fi/prices/current/${underlyingTokenPriceKey}`
          ),
          getIncentivesAprForVault(vault),
        ]);

      const underlyingTokenPrice =
        underlyingTokenPriceObj.body.coins[underlyingTokenPriceKey].price;
      const tvl = tvlRaw / 10 ** vault.decimals;

      gmVaults.push({
        pool: vault.address,
        tvlUsd: +(tvl * underlyingTokenPrice),
        apyBase: vaultApr,
        apy: vaultApr,
        apyReward: arbIncentivesApr,
        symbol: vault.symbol,
        rewardTokens: [vault.underlyingAsset, ARB_ADDRESS],
        underlyingTokens: [vault.underlyingAsset],
        url: `https://umami.finance/vaults/gm/${vault.id}`,
      });
    })
  );

  return gmVaults;
};

module.exports = {
  getUmamiGmVaultsYield,
};
