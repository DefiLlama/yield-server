const superagent = require('superagent');
const { Web3 } = require('web3');
const ethers = require('ethers');

const { ARB_MASTER_CHEF, ARB_ADDRESS } = require('./umamiConstants.js');
const { GM_ASSET_VAULT_ABI } = require('./abis/gmAssetVault.js');
const { ARB_MASTER_CHEF_ABI } = require('./abis/arbMasterchef.js');

const RPC_URL = 'https://rpc.ankr.com/arbitrum';

const web3 = new Web3(RPC_URL);

const masterchefContract = new web3.eth.Contract(
  ARB_MASTER_CHEF_ABI,
  ARB_MASTER_CHEF
);

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
    totalAllocpointsRaw,
    vaultPoolInfos,
    stakedBalanceRaw,
    vaultPpsRaw,
    underlyingTokenPriceObj,
    arbTokenPriceObj,
  ] = await Promise.all([
    masterchefContract.methods.arbPerSec().call(),
    masterchefContract.methods.totalAllocPoint().call(),
    masterchefContract.methods.poolInfo(vault.masterchefLpId).call(),
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

  const arbPerSec = Number(ethers.utils.formatUnits(arbPerSecRaw, 18));
  const vaultAllocPoints = Number(
    ethers.utils.formatUnits(vaultPoolInfos.allocPoint, 0)
  );
  const totalAllocpoints = Number(
    ethers.utils.formatUnits(totalAllocpointsRaw, 0)
  );
  const vaultPps = Number(
    ethers.utils.formatUnits(vaultPpsRaw, vault.decimals)
  );
  const assetsStakedTvl =
    Number(ethers.utils.formatUnits(stakedBalanceRaw, vault.decimals)) *
    vaultPps;

  const emissionsPerYearInUsd =
    (arbPerSec *
      (vaultAllocPoints / totalAllocpoints) *
      arbTokenPrice *
      60 *
      60 *
      24 *
      365) /
    underlyingTokenPrice;

  const emissionsPerYearInTokens =
    emissionsPerYearInUsd / (assetsStakedTvl * vaultPps);

  const apr = emissionsPerYearInTokens * 100;

  return isNaN(apr) ? 0 : apr;
};

module.exports = {
  getIncentivesAprForVault,
};
