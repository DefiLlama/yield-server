const superagent = require('superagent');
const { Web3 } = require('web3');
const sdk = require('@defillama/sdk');

const arbitrumCoreAddresses = require('./arbitrum/umamiConstants.js');
const avalancheCoreAddresses = require('./avalanche/umamiConstants.js');

const { GM_ASSET_VAULT_ABI } = require('./abis/gmAssetVault.js');
const { GMI_VAULT_ABI } = require('./abis/gmiVault.js');
const { GMI_AGGREGATE_VAULT_ABI } = require('./abis/gmiAggregateVault.js');
const { ARB_MASTER_CHEF_ABI } = require('./abis/arbMasterchef.js');

const ARB_RPC_URL = 'https://arbitrum.llamarpc.com';
const AVAX_RPC_URL = 'https://avalanche.public-rpc.com';

const arbitrumWeb3Client = new Web3(ARB_RPC_URL);
const avalancheWeb3Client = new Web3(AVAX_RPC_URL);

const getUmamiContractsForChain = (chain) => {
  if (chain === 'arbitrum') {
    return {
      gmiContract: new arbitrumWeb3Client.eth.Contract(
        GMI_VAULT_ABI,
        arbitrumCoreAddresses.GMI_VAULT
      ),
      masterchefContract: new arbitrumWeb3Client.eth.Contract(
        ARB_MASTER_CHEF_ABI,
        arbitrumCoreAddresses.MASTER_CHEF
      ),
    };
  } else {
    return {
      gmiContract: new avalancheWeb3Client.eth.Contract(
        GMI_VAULT_ABI,
        avalancheCoreAddresses.GMI_VAULT
      ),
      masterchefContract: undefined,
    };
  }
};

const getAggregateVaultContractForVault = (chain, aggregateVaultAddress) => {
  if (chain === 'arbitrum') {
    return new arbitrumWeb3Client.eth.Contract(
      GMI_AGGREGATE_VAULT_ABI,
      aggregateVaultAddress
    );
  } else {
    return new avalancheWeb3Client.eth.Contract(
      GMI_AGGREGATE_VAULT_ABI,
      aggregateVaultAddress
    );
  }
};

const getVaultContractForVault = (chain, vaultAddress) => {
  if (chain === 'arbitrum') {
    return new arbitrumWeb3Client.eth.Contract(
      GM_ASSET_VAULT_ABI,
      vaultAddress
    );
  } else {
    return new avalancheWeb3Client.eth.Contract(
      GM_ASSET_VAULT_ABI,
      vaultAddress
    );
  }
};

module.exports = {
  getUmamiContractsForChain,
  getAggregateVaultContractForVault,
  getVaultContractForVault,
};
