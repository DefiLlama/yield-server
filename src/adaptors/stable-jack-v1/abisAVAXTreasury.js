module.exports = [
  {
    inputs: [
      {
        internalType: 'uint256',
        name: '_initialMintRatio',
        type: 'uint256',
      },
    ],
    stateMutability: 'nonpayable',
    type: 'constructor',
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: 'address',
        name: 'caller',
        type: 'address',
      },
      {
        indexed: false,
        internalType: 'uint256',
        name: 'totalRewards',
        type: 'uint256',
      },
      {
        indexed: false,
        internalType: 'uint256',
        name: 'rebalancePoolRewards',
        type: 'uint256',
      },
      {
        indexed: false,
        internalType: 'uint256',
        name: 'harvestBounty',
        type: 'uint256',
      },
    ],
    name: 'Harvest',
    type: 'event',
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: 'address',
        name: 'previousOwner',
        type: 'address',
      },
      {
        indexed: true,
        internalType: 'address',
        name: 'newOwner',
        type: 'address',
      },
    ],
    name: 'OwnershipTransferred',
    type: 'event',
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: false,
        internalType: 'uint256',
        name: 'price',
        type: 'uint256',
      },
      {
        indexed: false,
        internalType: 'uint256',
        name: 'aNav',
        type: 'uint256',
      },
    ],
    name: 'ProtocolSettle',
    type: 'event',
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: false,
        internalType: 'uint256',
        name: 'baseTokenCap',
        type: 'uint256',
      },
    ],
    name: 'UpdateBaseTokenCap',
    type: 'event',
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: false,
        internalType: 'uint256',
        name: 'beta',
        type: 'uint256',
      },
    ],
    name: 'UpdateBeta',
    type: 'event',
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: false,
        internalType: 'uint24',
        name: 'sampleInterval',
        type: 'uint24',
      },
    ],
    name: 'UpdateEMASampleInterval',
    type: 'event',
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: false,
        internalType: 'address',
        name: 'platform',
        type: 'address',
      },
    ],
    name: 'UpdatePlatform',
    type: 'event',
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: false,
        internalType: 'address',
        name: 'priceOracle',
        type: 'address',
      },
    ],
    name: 'UpdatePriceOracle',
    type: 'event',
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: false,
        internalType: 'address',
        name: 'rateProvider',
        type: 'address',
      },
    ],
    name: 'UpdateRateProvider',
    type: 'event',
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: false,
        internalType: 'address',
        name: 'rebalancePool',
        type: 'address',
      },
    ],
    name: 'UpdateRebalancePool',
    type: 'event',
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: false,
        internalType: 'uint256',
        name: 'rebalancePoolRatio',
        type: 'uint256',
      },
      {
        indexed: false,
        internalType: 'uint256',
        name: 'harvestBountyRatio',
        type: 'uint256',
      },
    ],
    name: 'UpdateRewardRatio',
    type: 'event',
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: false,
        internalType: 'address',
        name: 'account',
        type: 'address',
      },
      {
        indexed: false,
        internalType: 'bool',
        name: 'status',
        type: 'bool',
      },
    ],
    name: 'UpdateSettleWhitelist',
    type: 'event',
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: false,
        internalType: 'uint24',
        name: 'sampleInterval',
        type: 'uint24',
      },
    ],
    name: 'V2Initialized',
    type: 'event',
  },
  {
    inputs: [],
    name: 'aToken',
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
    inputs: [],
    name: 'baseToken',
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
    inputs: [],
    name: 'baseTokenCap',
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
    inputs: [],
    name: 'beta',
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
    inputs: [],
    name: 'collateralRatio',
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
        name: '_amount',
        type: 'uint256',
      },
    ],
    name: 'convertToUnwrapped',
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
        name: '_amount',
        type: 'uint256',
      },
    ],
    name: 'convertToWrapped',
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
    inputs: [],
    name: 'currentBaseTokenPrice',
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
    inputs: [],
    name: 'emaLeverageRatio',
    outputs: [
      {
        internalType: 'uint40',
        name: 'lastTime',
        type: 'uint40',
      },
      {
        internalType: 'uint24',
        name: 'sampleInterval',
        type: 'uint24',
      },
      {
        internalType: 'uint96',
        name: 'lastValue',
        type: 'uint96',
      },
      {
        internalType: 'uint96',
        name: 'lastEmaValue',
        type: 'uint96',
      },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'getCurrentNav',
    outputs: [
      {
        internalType: 'uint256',
        name: '_baseNav',
        type: 'uint256',
      },
      {
        internalType: 'uint256',
        name: '_aNav',
        type: 'uint256',
      },
      {
        internalType: 'uint256',
        name: '_xNav',
        type: 'uint256',
      },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'harvest',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [],
    name: 'harvestBountyRatio',
    outputs: [
      {
        internalType: 'uint128',
        name: '',
        type: 'uint128',
      },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      {
        internalType: 'address',
        name: '_market',
        type: 'address',
      },
      {
        internalType: 'address',
        name: '_baseToken',
        type: 'address',
      },
      {
        internalType: 'address',
        name: '_aToken',
        type: 'address',
      },
      {
        internalType: 'address',
        name: '_xToken',
        type: 'address',
      },
      {
        internalType: 'address',
        name: '_priceOracle',
        type: 'address',
      },
      {
        internalType: 'uint256',
        name: '_beta',
        type: 'uint256',
      },
      {
        internalType: 'uint256',
        name: '_baseTokenCap',
        type: 'uint256',
      },
      {
        internalType: 'address',
        name: '_rateProvider',
        type: 'address',
      },
    ],
    name: 'initialize',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [],
    name: 'initializePrice',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      {
        internalType: 'uint24',
        name: 'sampleInterval',
        type: 'uint24',
      },
    ],
    name: 'initializeV2',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [],
    name: 'isBaseTokenPriceValid',
    outputs: [
      {
        internalType: 'bool',
        name: '_isValid',
        type: 'bool',
      },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'isUnderCollateral',
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
    inputs: [],
    name: 'lastPermissionedPrice',
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
    inputs: [],
    name: 'leverageRatio',
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
    inputs: [],
    name: 'market',
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
        internalType: 'uint256',
        name: '_newCollateralRatio',
        type: 'uint256',
      },
      {
        internalType: 'uint256',
        name: '_incentiveRatio',
        type: 'uint256',
      },
    ],
    name: 'maxLiquidatable',
    outputs: [
      {
        internalType: 'uint256',
        name: '_maxBaseOut',
        type: 'uint256',
      },
      {
        internalType: 'uint256',
        name: '_maxaTokenLiquidatable',
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
        name: '_newCollateralRatio',
        type: 'uint256',
      },
    ],
    name: 'maxMintableXToken',
    outputs: [
      {
        internalType: 'uint256',
        name: '_maxBaseIn',
        type: 'uint256',
      },
      {
        internalType: 'uint256',
        name: '_maxXTokenMintable',
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
        name: '_newCollateralRatio',
        type: 'uint256',
      },
      {
        internalType: 'uint256',
        name: '_incentiveRatio',
        type: 'uint256',
      },
    ],
    name: 'maxMintableXTokenWithIncentive',
    outputs: [
      {
        internalType: 'uint256',
        name: '_maxBaseIn',
        type: 'uint256',
      },
      {
        internalType: 'uint256',
        name: '_maxXTokenMintable',
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
        name: '_newCollateralRatio',
        type: 'uint256',
      },
    ],
    name: 'maxMintableaToken',
    outputs: [
      {
        internalType: 'uint256',
        name: '_maxBaseIn',
        type: 'uint256',
      },
      {
        internalType: 'uint256',
        name: '_maxaTokenMintable',
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
        name: '_newCollateralRatio',
        type: 'uint256',
      },
    ],
    name: 'maxRedeemableXToken',
    outputs: [
      {
        internalType: 'uint256',
        name: '_maxBaseOut',
        type: 'uint256',
      },
      {
        internalType: 'uint256',
        name: '_maxXTokenRedeemable',
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
        name: '_newCollateralRatio',
        type: 'uint256',
      },
    ],
    name: 'maxRedeemableaToken',
    outputs: [
      {
        internalType: 'uint256',
        name: '_maxBaseOut',
        type: 'uint256',
      },
      {
        internalType: 'uint256',
        name: '_maxaTokenRedeemable',
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
        name: '_baseIn',
        type: 'uint256',
      },
      {
        internalType: 'address',
        name: '_recipient',
        type: 'address',
      },
      {
        internalType: 'enum IJackTreasury.MintOption',
        name: '_option',
        type: 'uint8',
      },
    ],
    name: 'mint',
    outputs: [
      {
        internalType: 'uint256',
        name: '_aTokenOut',
        type: 'uint256',
      },
      {
        internalType: 'uint256',
        name: '_xTokenOut',
        type: 'uint256',
      },
    ],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [],
    name: 'owner',
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
    inputs: [],
    name: 'platform',
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
    inputs: [],
    name: 'priceOracle',
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
    inputs: [],
    name: 'rateProvider',
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
    inputs: [],
    name: 'rebalancePool',
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
    inputs: [],
    name: 'rebalancePoolRatio',
    outputs: [
      {
        internalType: 'uint128',
        name: '',
        type: 'uint128',
      },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      {
        internalType: 'uint256',
        name: '_aTokenIn',
        type: 'uint256',
      },
      {
        internalType: 'uint256',
        name: '_xTokenIn',
        type: 'uint256',
      },
      {
        internalType: 'address',
        name: '_owner',
        type: 'address',
      },
    ],
    name: 'redeem',
    outputs: [
      {
        internalType: 'uint256',
        name: '_baseOut',
        type: 'uint256',
      },
    ],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [],
    name: 'renounceOwnership',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      {
        internalType: 'address',
        name: '',
        type: 'address',
      },
    ],
    name: 'settleWhitelist',
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
    inputs: [],
    name: 'totalBaseToken',
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
        name: 'newOwner',
        type: 'address',
      },
    ],
    name: 'transferOwnership',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      {
        internalType: 'uint256',
        name: '_baseTokenCap',
        type: 'uint256',
      },
    ],
    name: 'updateBaseTokenCap',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      {
        internalType: 'uint256',
        name: '_beta',
        type: 'uint256',
      },
    ],
    name: 'updateBeta',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      {
        internalType: 'uint24',
        name: '_sampleInterval',
        type: 'uint24',
      },
    ],
    name: 'updateEMASampleInterval',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      {
        internalType: 'address',
        name: '_platform',
        type: 'address',
      },
    ],
    name: 'updatePlatform',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      {
        internalType: 'address',
        name: '_priceOracle',
        type: 'address',
      },
    ],
    name: 'updatePriceOracle',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      {
        internalType: 'address',
        name: '_rateProvider',
        type: 'address',
      },
    ],
    name: 'updateRateProvider',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      {
        internalType: 'address',
        name: '_rebalancePool',
        type: 'address',
      },
    ],
    name: 'updateRebalancePool',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      {
        internalType: 'uint128',
        name: '_rebalancePoolRatio',
        type: 'uint128',
      },
      {
        internalType: 'uint128',
        name: '_harvestBountyRatio',
        type: 'uint128',
      },
    ],
    name: 'updateRewardRatio',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      {
        internalType: 'address',
        name: '_account',
        type: 'address',
      },
      {
        internalType: 'bool',
        name: '_status',
        type: 'bool',
      },
    ],
    name: 'updateSettleWhitelist',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [],
    name: 'xAVAXLeverageRatio',
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
    inputs: [],
    name: 'xToken',
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
];
