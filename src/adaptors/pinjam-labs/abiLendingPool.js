module.exports = [
  {
    inputs: [
      {
        internalType: 'address',
        name: '_underlyingAsset',
        type: 'address',
      },
    ],
    name: 'getAmountWorked',
    outputs: [
      {
        internalType: 'uint256',
        name: '',
        type: 'uint256',
      },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      {
        internalType: 'address',
        name: '_underlyingAsset',
        type: 'address',
      },
    ],
    name: 'getBorrowRate',
    outputs: [
      {
        internalType: 'uint256',
        name: '',
        type: 'uint256',
      },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      {
        internalType: 'address',
        name: '_underlyingAsset',
        type: 'address',
      },
    ],
    name: 'getDebtToken',
    outputs: [
      {
        internalType: 'address',
        name: '',
        type: 'address',
      },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      {
        internalType: 'address',
        name: '_underlyingAsset',
        type: 'address',
      },
    ],
    name: 'getDepositToVaultStatus',
    outputs: [
      {
        internalType: 'bool',
        name: 'status_',
        type: 'bool',
      },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      {
        internalType: 'address',
        name: '_underlyingAsset',
        type: 'address',
      },
    ],
    name: 'getFlags',
    outputs: [
      {
        internalType: 'bool',
        name: 'assetAsCollateral',
        type: 'bool',
      },
      {
        internalType: 'bool',
        name: 'depositEnabled',
        type: 'bool',
      },
      {
        internalType: 'bool',
        name: 'borrowEnabled',
        type: 'bool',
      },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      {
        internalType: 'address',
        name: '_underlyingAsset',
        type: 'address',
      },
    ],
    name: 'getInterestConfig',
    outputs: [
      {
        internalType: 'uint256',
        name: 'variableSlope1',
        type: 'uint256',
      },
      {
        internalType: 'uint256',
        name: 'variableSlope2',
        type: 'uint256',
      },
      {
        internalType: 'uint256',
        name: 'optimalUtilizationRate',
        type: 'uint256',
      },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      {
        internalType: 'address',
        name: '_underlyingAsset',
        type: 'address',
      },
    ],
    name: 'getLiquidationConfig',
    outputs: [
      {
        internalType: 'uint256',
        name: 'loanToValue',
        type: 'uint256',
      },
      {
        internalType: 'uint256',
        name: 'liquidationThreshold',
        type: 'uint256',
      },
      {
        internalType: 'uint256',
        name: 'liquidationBonus',
        type: 'uint256',
      },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      {
        internalType: 'address',
        name: '_underlyingAsset',
        type: 'address',
      },
    ],
    name: 'getMaxCapitalEfficiency',
    outputs: [
      {
        internalType: 'uint256',
        name: '',
        type: 'uint256',
      },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      {
        internalType: 'address',
        name: '_underlyingAsset',
        type: 'address',
      },
    ],
    name: 'getNormalizedBorrowIndex',
    outputs: [
      {
        internalType: 'uint256',
        name: '',
        type: 'uint256',
      },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      {
        internalType: 'address',
        name: '_underlyingAsset',
        type: 'address',
      },
    ],
    name: 'getNormalizedSupplyIndex',
    outputs: [
      {
        internalType: 'uint256',
        name: '',
        type: 'uint256',
      },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      {
        internalType: 'address',
        name: '_underlyingAsset',
        type: 'address',
      },
    ],
    name: 'getPToken',
    outputs: [
      {
        internalType: 'address',
        name: '',
        type: 'address',
      },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      {
        internalType: 'address',
        name: '_underlyingAsset',
        type: 'address',
      },
      {
        internalType: 'address',
        name: '_user',
        type: 'address',
      },
    ],
    name: 'getPendingVaultRewards',
    outputs: [
      {
        internalType: 'uint256',
        name: '',
        type: 'uint256',
      },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      {
        internalType: 'address',
        name: '_underlyingAsset',
        type: 'address',
      },
    ],
    name: 'getPoolRewardsData',
    outputs: [
      {
        internalType: 'uint256',
        name: 'accRewardPerShare_',
        type: 'uint256',
      },
      {
        internalType: 'uint256',
        name: 'rewardsClaimed_',
        type: 'uint256',
      },
      {
        internalType: 'uint256',
        name: 'accRewards_',
        type: 'uint256',
      },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      {
        internalType: 'address',
        name: '_underlyingAsset',
        type: 'address',
      },
    ],
    name: 'getReserveFactors',
    outputs: [
      {
        internalType: 'uint256',
        name: 'borrowFactor',
        type: 'uint256',
      },
      {
        internalType: 'uint256',
        name: 'farmingFactor',
        type: 'uint256',
      },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      {
        internalType: 'address',
        name: '_underlyingAsset',
        type: 'address',
      },
    ],
    name: 'getReserveFees',
    outputs: [
      {
        internalType: 'uint256',
        name: 'vaultDepositFees',
        type: 'uint256',
      },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      {
        internalType: 'address',
        name: '_underlyingAsset',
        type: 'address',
      },
    ],
    name: 'getReserveId',
    outputs: [
      {
        internalType: 'uint256',
        name: '',
        type: 'uint256',
      },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      {
        internalType: 'address',
        name: '_underlyingAsset',
        type: 'address',
      },
    ],
    name: 'getSupplyAndDebtLimit',
    outputs: [
      {
        internalType: 'uint256',
        name: 'supplyLimit',
        type: 'uint256',
      },
      {
        internalType: 'uint256',
        name: 'debtLimit',
        type: 'uint256',
      },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      {
        internalType: 'address',
        name: '_underlyingAsset',
        type: 'address',
      },
    ],
    name: 'getSupplyRate',
    outputs: [
      {
        internalType: 'uint256',
        name: '',
        type: 'uint256',
      },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      {
        internalType: 'uint256',
        name: '_index',
        type: 'uint256',
      },
    ],
    name: 'getSupportedAsset',
    outputs: [
      {
        internalType: 'address',
        name: '',
        type: 'address',
      },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      {
        internalType: 'address',
        name: '_underlyingAsset',
        type: 'address',
      },
    ],
    name: 'getTotalDebt',
    outputs: [
      {
        internalType: 'uint256',
        name: '',
        type: 'uint256',
      },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      {
        internalType: 'address',
        name: '_underlyingAsset',
        type: 'address',
      },
    ],
    name: 'getTotalLiquidity',
    outputs: [
      {
        internalType: 'uint256',
        name: '',
        type: 'uint256',
      },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      {
        internalType: 'address',
        name: '_underlyingAsset',
        type: 'address',
      },
    ],
    name: 'getTotalVaultRewards',
    outputs: [
      {
        internalType: 'uint256',
        name: 'totalRewards',
        type: 'uint256',
      },
      {
        internalType: 'uint256',
        name: 'vaultDepositRewards',
        type: 'uint256',
      },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      {
        internalType: 'address',
        name: '_user',
        type: 'address',
      },
    ],
    name: 'getUserData',
    outputs: [
      {
        internalType: 'uint256',
        name: 'healthFactor',
        type: 'uint256',
      },
      {
        internalType: 'uint256',
        name: 'totalCollateralInBaseCurrency',
        type: 'uint256',
      },
      {
        internalType: 'uint256',
        name: 'totalDebtInBaseCurrency',
        type: 'uint256',
      },
      {
        internalType: 'uint256',
        name: 'avgLtv',
        type: 'uint256',
      },
      {
        internalType: 'uint256',
        name: 'avgLiquiditationThreshold',
        type: 'uint256',
      },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      {
        internalType: 'address',
        name: '_underlyingAsset',
        type: 'address',
      },
      {
        internalType: 'address',
        name: '_user',
        type: 'address',
      },
    ],
    name: 'getUserIsUsingAsCollateral',
    outputs: [
      {
        internalType: 'bool',
        name: '',
        type: 'bool',
      },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      {
        internalType: 'address',
        name: '_underlyingAsset',
        type: 'address',
      },
      {
        internalType: 'address',
        name: '_user',
        type: 'address',
      },
    ],
    name: 'getUserRewardsData',
    outputs: [
      {
        internalType: 'uint256',
        name: 'rewardDebt_',
        type: 'uint256',
      },
      {
        internalType: 'uint256',
        name: 'rewardsOwed_',
        type: 'uint256',
      },
    ],
    stateMutability: 'view',
    type: 'function',
  },
];
