const superagent = require('superagent');
const ethers = require('ethers');

const arbitrumConstants = require('./arbitrum/umamiConstants.js');
const avalancheConstants = require('./arbitrum/umamiConstants.js');

const {
  getUmamiContractsForChain,
  getVaultContractForVault,
} = require('./umamiContracts.js');

// Incentives through Masterchef
const getIncentivesAprForVault = async (vault, chain) => {
  const rewardTokenAddress =
    chain === 'arbitrum'
      ? arbitrumConstants.REWARD_TOKEN_ADDRESS
      : avalancheConstants.REWARD_TOKEN_ADDRESS;
  const masterChefAddress =
    chain === 'arbitrum'
      ? arbitrumConstants.MASTER_CHEF
      : avalancheConstants.MASTER_CHEF;

  const coreContracts = getUmamiContractsForChain(chain);
  const vaultContract = getVaultContractForVault(chain, vault.address);

  const underlyingTokenPriceKey =
    `${chain}:${vault.underlyingAsset}`.toLowerCase();
  const arbTokenPriceKey = `${chain}:${rewardTokenAddress}`.toLowerCase();
  const [
    arbPerSecRaw,
    totalAllocpointsRaw,
    vaultPoolInfos,
    stakedBalanceRaw,
    vaultPpsRaw,
    underlyingTokenPriceObj,
    arbTokenPriceObj,
  ] = await Promise.all([
    coreContracts.masterchefContract.methods.arbPerSec().call(),
    coreContracts.masterchefContract.methods.totalAllocPoint().call(),
    coreContracts.masterchefContract.methods
      .poolInfo(vault.masterchefLpId)
      .call(),
    vaultContract.methods.balanceOf(masterChefAddress).call(),
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
