module.exports = {
  ethereum: {
    UiPoolDataProvider: {
      getReservesData: {
        inputs: [
          {
            internalType: 'contract IPoolAddressesProvider',
            name: 'provider',
            type: 'address',
          },
        ],
        name: 'getReservesData',
        outputs: [
          {
            components: [
              {
                internalType: 'address',
                name: 'underlyingAsset',
                type: 'address',
              },
              {
                internalType: 'string',
                name: 'name',
                type: 'string',
              },
              {
                internalType: 'string',
                name: 'symbol',
                type: 'string',
              },
              {
                internalType: 'uint256',
                name: 'decimals',
                type: 'uint256',
              },
              {
                internalType: 'uint256',
                name: 'baseLTVasCollateral',
                type: 'uint256',
              },
              {
                internalType: 'uint256',
                name: 'reserveLiquidationThreshold',
                type: 'uint256',
              },
              {
                internalType: 'uint256',
                name: 'reserveLiquidationBonus',
                type: 'uint256',
              },
              {
                internalType: 'uint256',
                name: 'reserveFactor',
                type: 'uint256',
              },
              {
                internalType: 'bool',
                name: 'usageAsCollateralEnabled',
                type: 'bool',
              },
              {
                internalType: 'bool',
                name: 'borrowingEnabled',
                type: 'bool',
              },
              {
                internalType: 'bool',
                name: 'auctionEnabled',
                type: 'bool',
              },
              {
                internalType: 'bool',
                name: 'isActive',
                type: 'bool',
              },
              {
                internalType: 'bool',
                name: 'isFrozen',
                type: 'bool',
              },
              {
                internalType: 'bool',
                name: 'isPaused',
                type: 'bool',
              },
              {
                internalType: 'bool',
                name: 'isAtomicPricing',
                type: 'bool',
              },
              {
                internalType: 'uint128',
                name: 'liquidityIndex',
                type: 'uint128',
              },
              {
                internalType: 'uint128',
                name: 'variableBorrowIndex',
                type: 'uint128',
              },
              {
                internalType: 'uint128',
                name: 'liquidityRate',
                type: 'uint128',
              },
              {
                internalType: 'uint128',
                name: 'variableBorrowRate',
                type: 'uint128',
              },
              {
                internalType: 'uint40',
                name: 'lastUpdateTimestamp',
                type: 'uint40',
              },
              {
                internalType: 'address',
                name: 'xTokenAddress',
                type: 'address',
              },
              {
                internalType: 'address',
                name: 'variableDebtTokenAddress',
                type: 'address',
              },
              {
                internalType: 'address',
                name: 'interestRateStrategyAddress',
                type: 'address',
              },
              {
                internalType: 'address',
                name: 'auctionStrategyAddress',
                type: 'address',
              },
              {
                internalType: 'uint256',
                name: 'availableLiquidity',
                type: 'uint256',
              },
              {
                internalType: 'uint256',
                name: 'totalScaledVariableDebt',
                type: 'uint256',
              },
              {
                internalType: 'uint256',
                name: 'priceInMarketReferenceCurrency',
                type: 'uint256',
              },
              {
                internalType: 'address',
                name: 'priceOracle',
                type: 'address',
              },
              {
                internalType: 'uint256',
                name: 'variableRateSlope1',
                type: 'uint256',
              },
              {
                internalType: 'uint256',
                name: 'variableRateSlope2',
                type: 'uint256',
              },
              {
                internalType: 'uint256',
                name: 'baseVariableBorrowRate',
                type: 'uint256',
              },
              {
                internalType: 'uint256',
                name: 'optimalUsageRatio',
                type: 'uint256',
              },
              {
                internalType: 'uint128',
                name: 'accruedToTreasury',
                type: 'uint128',
              },
              {
                internalType: 'uint256',
                name: 'borrowCap',
                type: 'uint256',
              },
              {
                internalType: 'uint256',
                name: 'supplyCap',
                type: 'uint256',
              },
              {
                internalType: 'enum DataTypes.AssetType',
                name: 'assetType',
                type: 'uint8',
              },
            ],
            internalType: 'struct IUiPoolDataProvider.AggregatedReserveData[]',
            name: '',
            type: 'tuple[]',
          },
          {
            components: [
              {
                internalType: 'uint256',
                name: 'marketReferenceCurrencyUnit',
                type: 'uint256',
              },
              {
                internalType: 'int256',
                name: 'marketReferenceCurrencyPriceInUsd',
                type: 'int256',
              },
              {
                internalType: 'int256',
                name: 'networkBaseTokenPriceInUsd',
                type: 'int256',
              },
              {
                internalType: 'uint8',
                name: 'networkBaseTokenPriceDecimals',
                type: 'uint8',
              },
            ],
            internalType: 'struct IUiPoolDataProvider.BaseCurrencyInfo',
            name: '',
            type: 'tuple',
          },
        ],
        stateMutability: 'view',
        type: 'function',
      },
    },
  },
  arbitrum: {
    UiPoolDataProvider: {
      getReservesData: {
        inputs: [
          {
            internalType: 'contract IPoolAddressesProvider',
            name: 'provider',
            type: 'address',
          },
        ],
        name: 'getReservesData',
        outputs: [
          {
            components: [
              {
                internalType: 'address',
                name: 'underlyingAsset',
                type: 'address',
              },
              { internalType: 'string', name: 'name', type: 'string' },
              { internalType: 'string', name: 'symbol', type: 'string' },
              { internalType: 'uint256', name: 'decimals', type: 'uint256' },
              {
                internalType: 'uint256',
                name: 'baseLTVasCollateral',
                type: 'uint256',
              },
              {
                internalType: 'uint256',
                name: 'reserveLiquidationThreshold',
                type: 'uint256',
              },
              {
                internalType: 'uint256',
                name: 'reserveLiquidationBonus',
                type: 'uint256',
              },
              {
                internalType: 'uint256',
                name: 'reserveFactor',
                type: 'uint256',
              },
              {
                internalType: 'bool',
                name: 'usageAsCollateralEnabled',
                type: 'bool',
              },
              { internalType: 'bool', name: 'borrowingEnabled', type: 'bool' },
              { internalType: 'bool', name: 'auctionEnabled', type: 'bool' },
              { internalType: 'bool', name: 'isActive', type: 'bool' },
              { internalType: 'bool', name: 'isFrozen', type: 'bool' },
              { internalType: 'bool', name: 'isPaused', type: 'bool' },
              { internalType: 'bool', name: 'isAtomicPricing', type: 'bool' },
              {
                internalType: 'uint128',
                name: 'liquidityIndex',
                type: 'uint128',
              },
              {
                internalType: 'uint128',
                name: 'variableBorrowIndex',
                type: 'uint128',
              },
              {
                internalType: 'uint128',
                name: 'liquidityRate',
                type: 'uint128',
              },
              {
                internalType: 'uint128',
                name: 'variableBorrowRate',
                type: 'uint128',
              },
              {
                internalType: 'uint40',
                name: 'lastUpdateTimestamp',
                type: 'uint40',
              },
              {
                internalType: 'address',
                name: 'xTokenAddress',
                type: 'address',
              },
              {
                internalType: 'address',
                name: 'variableDebtTokenAddress',
                type: 'address',
              },
              {
                internalType: 'address',
                name: 'interestRateStrategyAddress',
                type: 'address',
              },
              {
                internalType: 'address',
                name: 'auctionStrategyAddress',
                type: 'address',
              },
              {
                internalType: 'address',
                name: 'timeLockStrategyAddress',
                type: 'address',
              },
              {
                internalType: 'uint256',
                name: 'availableLiquidity',
                type: 'uint256',
              },
              {
                internalType: 'uint256',
                name: 'totalScaledVariableDebt',
                type: 'uint256',
              },
              {
                internalType: 'uint256',
                name: 'priceInMarketReferenceCurrency',
                type: 'uint256',
              },
              { internalType: 'address', name: 'priceOracle', type: 'address' },
              {
                internalType: 'uint256',
                name: 'variableRateSlope1',
                type: 'uint256',
              },
              {
                internalType: 'uint256',
                name: 'variableRateSlope2',
                type: 'uint256',
              },
              {
                internalType: 'uint256',
                name: 'baseVariableBorrowRate',
                type: 'uint256',
              },
              {
                internalType: 'uint256',
                name: 'optimalUsageRatio',
                type: 'uint256',
              },
              {
                internalType: 'uint128',
                name: 'accruedToTreasury',
                type: 'uint128',
              },
              { internalType: 'uint256', name: 'borrowCap', type: 'uint256' },
              { internalType: 'uint256', name: 'supplyCap', type: 'uint256' },
              {
                internalType: 'enum DataTypes.AssetType',
                name: 'assetType',
                type: 'uint8',
              },
              {
                components: [
                  {
                    internalType: 'uint256',
                    name: 'minThreshold',
                    type: 'uint256',
                  },
                  {
                    internalType: 'uint256',
                    name: 'midThreshold',
                    type: 'uint256',
                  },
                  {
                    internalType: 'uint48',
                    name: 'minWaitTime',
                    type: 'uint48',
                  },
                  {
                    internalType: 'uint48',
                    name: 'midWaitTime',
                    type: 'uint48',
                  },
                  {
                    internalType: 'uint48',
                    name: 'maxWaitTime',
                    type: 'uint48',
                  },
                  {
                    internalType: 'uint48',
                    name: 'poolPeriodWaitTime',
                    type: 'uint48',
                  },
                  {
                    internalType: 'uint256',
                    name: 'poolPeriodLimit',
                    type: 'uint256',
                  },
                  { internalType: 'uint256', name: 'period', type: 'uint256' },
                  {
                    internalType: 'uint128',
                    name: 'totalAmountInCurrentPeriod',
                    type: 'uint128',
                  },
                  {
                    internalType: 'uint48',
                    name: 'lastResetTimestamp',
                    type: 'uint48',
                  },
                ],
                internalType: 'struct ITimeLockStrategy.TimeLockStrategyData',
                name: 'timeLockStrategyData',
                type: 'tuple',
              },
            ],
            internalType: 'struct IUiPoolDataProvider.AggregatedReserveData[]',
            name: '',
            type: 'tuple[]',
          },
          {
            components: [
              {
                internalType: 'uint256',
                name: 'marketReferenceCurrencyUnit',
                type: 'uint256',
              },
              {
                internalType: 'int256',
                name: 'marketReferenceCurrencyPriceInUsd',
                type: 'int256',
              },
              {
                internalType: 'int256',
                name: 'networkBaseTokenPriceInUsd',
                type: 'int256',
              },
              {
                internalType: 'uint8',
                name: 'networkBaseTokenPriceDecimals',
                type: 'uint8',
              },
            ],
            internalType: 'struct IUiPoolDataProvider.BaseCurrencyInfo',
            name: '',
            type: 'tuple',
          },
        ],
        stateMutability: 'view',
        type: 'function',
      },
    },
  },
};
