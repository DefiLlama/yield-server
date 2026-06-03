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
  getSpokeCount: 'function getSpokeCount(uint256) view returns (uint256)',
  getSpokeAddress:
    'function getSpokeAddress(uint256,uint256) view returns (address)',
  getSpokeConfig:
    'function getSpokeConfig(uint256,address) view returns (tuple(uint40 addCap, uint40 drawCap, uint24 riskPremiumThreshold, bool active, bool halted))',
  getSpokeTotalOwed:
    'function getSpokeTotalOwed(uint256,address) view returns (uint256)',
  maxAllowedSpokeCap: 'function MAX_ALLOWED_SPOKE_CAP() view returns (uint40)',
  getReserveId: 'function getReserveId(address,uint256) view returns (uint256)',
  getReserve:
    'function getReserve(uint256) view returns (tuple(address underlying, address hub, uint16 assetId, uint8 decimals, uint24 collateralRisk, uint8 flags, uint32 dynamicConfigKey))',
  getReserveConfig:
    'function getReserveConfig(uint256) view returns (tuple(uint24 collateralRisk, bool paused, bool frozen, bool borrowable, bool receiveSharesEnabled))',
  getDynamicReserveConfig:
    'function getDynamicReserveConfig(uint256,uint32) view returns (tuple(uint16 collateralFactor, uint32 maxLiquidationBonus, uint16 liquidationFee))',
};
