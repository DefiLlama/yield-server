module.exports = {
  DataProviderAbi: [
    {
      inputs: [],
      name: 'getStrategies',
      outputs: [
        {
          components: [
            { internalType: 'address', name: 'deployedAt', type: 'address' },
            { internalType: 'address', name: 'pair', type: 'address' },
            {
              components: [
                { internalType: 'address', name: 'asset', type: 'address' },
                { internalType: 'string', name: 'assetSymbol', type: 'string' },
                {
                  internalType: 'uint256',
                  name: 'assetDecimals',
                  type: 'uint256',
                },
                {
                  internalType: 'address',
                  name: 'collateral',
                  type: 'address',
                },
                {
                  internalType: 'string',
                  name: 'collateralSymbol',
                  type: 'string',
                },
                {
                  internalType: 'uint256',
                  name: 'collateralDecimals',
                  type: 'uint256',
                },
                {
                  internalType: 'address',
                  name: 'rateContract',
                  type: 'address',
                },
                { internalType: 'address', name: 'oracle', type: 'address' },
                {
                  internalType: 'uint256',
                  name: 'depositLimit',
                  type: 'uint256',
                },
                { internalType: 'uint64', name: 'ratePerSec', type: 'uint64' },
                {
                  internalType: 'uint64',
                  name: 'fullUtilizationRate',
                  type: 'uint64',
                },
                {
                  internalType: 'uint32',
                  name: 'feeToProtocolRate',
                  type: 'uint32',
                },
                {
                  internalType: 'uint32',
                  name: 'maxOacleDeviation',
                  type: 'uint32',
                },
                {
                  internalType: 'uint256',
                  name: 'lowExchangeRate',
                  type: 'uint256',
                },
                {
                  internalType: 'uint256',
                  name: 'highExchangeRate',
                  type: 'uint256',
                },
                { internalType: 'uint256', name: 'maxLTV', type: 'uint256' },
                {
                  internalType: 'uint256',
                  name: 'protocolLiquidationFee',
                  type: 'uint256',
                },
                {
                  internalType: 'uint256',
                  name: 'totalAsset',
                  type: 'uint256',
                },
                {
                  internalType: 'uint256',
                  name: 'totalCollateral',
                  type: 'uint256',
                },
                {
                  internalType: 'uint256',
                  name: 'totalBorrow',
                  type: 'uint256',
                },
                { internalType: 'uint256', name: 'version', type: 'uint256' },
              ],
              internalType: 'struct IAggregatorDataProvider.StrategyPairData',
              name: 'pairData',
              type: 'tuple',
            },
          ],
          internalType: 'struct IAggregatorDataProvider.StrategyData[]',
          name: '',
          type: 'tuple[]',
        },
      ],
      stateMutability: 'view',
      type: 'function',
    },
    {
      inputs: [],
      name: 'getVaults',
      outputs: [
        {
          components: [
            { internalType: 'address', name: 'deployedAt', type: 'address' },
            { internalType: 'bool', name: 'isShutdown', type: 'bool' },
            { internalType: 'address', name: 'asset', type: 'address' },
            { internalType: 'string', name: 'assetSymbol', type: 'string' },
            { internalType: 'uint256', name: 'assetDecimals', type: 'uint256' },
            { internalType: 'string', name: 'name', type: 'string' },
            { internalType: 'uint256', name: 'totalAssets', type: 'uint256' },
            { internalType: 'uint256', name: 'totalDebt', type: 'uint256' },
            {
              components: [
                { internalType: 'uint256', name: 'maxDebt', type: 'uint256' },
                {
                  internalType: 'uint256',
                  name: 'currentDebt',
                  type: 'uint256',
                },
                {
                  internalType: 'address',
                  name: 'collateral',
                  type: 'address',
                },
                {
                  internalType: 'string',
                  name: 'collateralSymbol',
                  type: 'string',
                },
                {
                  internalType: 'uint256',
                  name: 'collateralDecimals',
                  type: 'uint256',
                },
                {
                  components: [
                    {
                      internalType: 'address',
                      name: 'deployedAt',
                      type: 'address',
                    },
                    { internalType: 'address', name: 'pair', type: 'address' },
                    {
                      components: [
                        {
                          internalType: 'address',
                          name: 'asset',
                          type: 'address',
                        },
                        {
                          internalType: 'string',
                          name: 'assetSymbol',
                          type: 'string',
                        },
                        {
                          internalType: 'uint256',
                          name: 'assetDecimals',
                          type: 'uint256',
                        },
                        {
                          internalType: 'address',
                          name: 'collateral',
                          type: 'address',
                        },
                        {
                          internalType: 'string',
                          name: 'collateralSymbol',
                          type: 'string',
                        },
                        {
                          internalType: 'uint256',
                          name: 'collateralDecimals',
                          type: 'uint256',
                        },
                        {
                          internalType: 'address',
                          name: 'rateContract',
                          type: 'address',
                        },
                        {
                          internalType: 'address',
                          name: 'oracle',
                          type: 'address',
                        },
                        {
                          internalType: 'uint256',
                          name: 'depositLimit',
                          type: 'uint256',
                        },
                        {
                          internalType: 'uint64',
                          name: 'ratePerSec',
                          type: 'uint64',
                        },
                        {
                          internalType: 'uint64',
                          name: 'fullUtilizationRate',
                          type: 'uint64',
                        },
                        {
                          internalType: 'uint32',
                          name: 'feeToProtocolRate',
                          type: 'uint32',
                        },
                        {
                          internalType: 'uint32',
                          name: 'maxOacleDeviation',
                          type: 'uint32',
                        },
                        {
                          internalType: 'uint256',
                          name: 'lowExchangeRate',
                          type: 'uint256',
                        },
                        {
                          internalType: 'uint256',
                          name: 'highExchangeRate',
                          type: 'uint256',
                        },
                        {
                          internalType: 'uint256',
                          name: 'maxLTV',
                          type: 'uint256',
                        },
                        {
                          internalType: 'uint256',
                          name: 'protocolLiquidationFee',
                          type: 'uint256',
                        },
                        {
                          internalType: 'uint256',
                          name: 'totalAsset',
                          type: 'uint256',
                        },
                        {
                          internalType: 'uint256',
                          name: 'totalCollateral',
                          type: 'uint256',
                        },
                        {
                          internalType: 'uint256',
                          name: 'totalBorrow',
                          type: 'uint256',
                        },
                        {
                          internalType: 'uint256',
                          name: 'version',
                          type: 'uint256',
                        },
                      ],
                      internalType:
                        'struct IAggregatorDataProvider.StrategyPairData',
                      name: 'pairData',
                      type: 'tuple',
                    },
                  ],
                  internalType: 'struct IAggregatorDataProvider.StrategyData',
                  name: 'strategyData',
                  type: 'tuple',
                },
              ],
              internalType:
                'struct IAggregatorDataProvider.VaultStrategyData[]',
              name: 'vaultStrategyData',
              type: 'tuple[]',
            },
          ],
          internalType: 'struct IAggregatorDataProvider.AggregatedVaultData[]',
          name: '',
          type: 'tuple[]',
        },
      ],
      stateMutability: 'view',
      type: 'function',
    },
  ],
};
