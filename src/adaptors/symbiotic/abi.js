module.exports = {
  // Registries (VaultFactory and DefaultStakerRewardsFactory share this interface)
  totalEntities: 'uint256:totalEntities',
  entity: 'function entity(uint256) view returns (address)',

  // Vaults
  version: 'uint64:version',
  asset: 'address:asset',
  collateral: 'address:collateral',
  totalAssets: 'uint256:totalAssets',
  activeStake: 'uint256:activeStake',
  convertToAssets: 'function convertToAssets(uint256) view returns (uint256)',

  // DefaultStakerRewards
  vault: 'address:VAULT',
  distributeRewards:
    'event DistributeRewards(address indexed network, address indexed token, uint256 distributeAmount, uint256 adminFeeAmount, uint48 timestamp)',
};
