module.exports = {
  getAssetCount: 'uint256:getAssetCount',
  getAssetUnderlyingAndDecimals:
    'function getAssetUnderlyingAndDecimals(uint256) view returns (address, uint8)',
  getAssetDrawnRate:
    'function getAssetDrawnRate(uint256) view returns (uint256)',
  getAddedAssets:
    'function getAddedAssets(uint256) view returns (uint256)',
  getAssetTotalOwed:
    'function getAssetTotalOwed(uint256) view returns (uint256)',
  getAsset:
    'function getAsset(uint256) view returns (tuple(uint120 liquidity, uint120 realizedFees, uint8 decimals, uint120 addedShares, uint120 swept, int200 premiumOffsetRay, uint120 drawnShares, uint120 premiumShares, uint16 liquidityFee, uint120 drawnIndex, uint96 drawnRate, uint40 lastUpdateTimestamp, address underlying, address irStrategy, address reinvestmentController, address feeReceiver, uint200 deficitRay))',
};
