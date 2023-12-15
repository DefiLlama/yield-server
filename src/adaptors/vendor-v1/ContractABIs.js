const FeesManagerABI = [
  {
    inputs: [],
    stateMutability: 'nonpayable',
    type: 'constructor',
  },
  {
    inputs: [],
    name: 'BorrowingPaused',
    type: 'error',
  },
  {
    inputs: [],
    name: 'ColTokenNotSupported',
    type: 'error',
  },
  {
    inputs: [],
    name: 'DebtIsLess',
    type: 'error',
  },
  {
    inputs: [],
    name: 'DifferentColToken',
    type: 'error',
  },
  {
    inputs: [],
    name: 'DifferentLendToken',
    type: 'error',
  },
  {
    inputs: [],
    name: 'DifferentPoolOwner',
    type: 'error',
  },
  {
    inputs: [],
    name: 'DiscountTooLarge',
    type: 'error',
  },
  {
    inputs: [],
    name: 'FeeTooHigh',
    type: 'error',
  },
  {
    inputs: [],
    name: 'FeeTooLarge',
    type: 'error',
  },
  {
    inputs: [],
    name: 'FeedAlreadySet',
    type: 'error',
  },
  {
    inputs: [],
    name: 'IllegalImplementation',
    type: 'error',
  },
  {
    inputs: [],
    name: 'InsufficientBalance',
    type: 'error',
  },
  {
    inputs: [],
    name: 'InvalidDiscount',
    type: 'error',
  },
  {
    inputs: [],
    name: 'InvalidExpiry',
    type: 'error',
  },
  {
    inputs: [],
    name: 'InvalidParameters',
    type: 'error',
  },
  {
    inputs: [],
    name: 'InvalidTokenPair',
    type: 'error',
  },
  {
    inputs: [],
    name: 'InvalidType',
    type: 'error',
  },
  {
    inputs: [],
    name: 'LendTokenNotSupported',
    type: 'error',
  },
  {
    inputs: [],
    name: 'LicenseNotFound',
    type: 'error',
  },
  {
    inputs: [],
    name: 'MintRatio0',
    type: 'error',
  },
  {
    inputs: [],
    name: 'NoDebt',
    type: 'error',
  },
  {
    inputs: [],
    name: 'NoPermission',
    type: 'error',
  },
  {
    inputs: [],
    name: 'NotAPool',
    type: 'error',
  },
  {
    inputs: [],
    name: 'NotAuthorized',
    type: 'error',
  },
  {
    inputs: [],
    name: 'NotEnoughLiquidity',
    type: 'error',
  },
  {
    inputs: [],
    name: 'NotFactory',
    type: 'error',
  },
  {
    inputs: [],
    name: 'NotGranted',
    type: 'error',
  },
  {
    inputs: [],
    name: 'NotOwner',
    type: 'error',
  },
  {
    inputs: [],
    name: 'NotValidPrice',
    type: 'error',
  },
  {
    inputs: [],
    name: 'OperationsPaused',
    type: 'error',
  },
  {
    inputs: [],
    name: 'OracleNotSet',
    type: 'error',
  },
  {
    inputs: [],
    name: 'PoolActive',
    type: 'error',
  },
  {
    inputs: [],
    name: 'PoolClosed',
    type: 'error',
  },
  {
    inputs: [],
    name: 'PoolNotWhitelisted',
    type: 'error',
  },
  {
    inputs: [],
    name: 'PrivatePool',
    type: 'error',
  },
  {
    inputs: [],
    name: 'RoundIncomplete',
    type: 'error',
  },
  {
    inputs: [],
    name: 'StaleAnswer',
    type: 'error',
  },
  {
    inputs: [],
    name: 'TransferFailed',
    type: 'error',
  },
  {
    inputs: [],
    name: 'UpgradeNotAllowed',
    type: 'error',
  },
  {
    inputs: [],
    name: 'ZeroAddress',
    type: 'error',
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: false,
        internalType: 'address',
        name: 'previousAdmin',
        type: 'address',
      },
      {
        indexed: false,
        internalType: 'address',
        name: 'newAdmin',
        type: 'address',
      },
    ],
    name: 'AdminChanged',
    type: 'event',
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: 'address',
        name: 'beacon',
        type: 'address',
      },
    ],
    name: 'BeaconUpgraded',
    type: 'event',
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: false,
        internalType: 'address',
        name: '_pool',
        type: 'address',
      },
      {
        indexed: false,
        internalType: 'uint48',
        name: '_feeRate',
        type: 'uint48',
      },
      {
        indexed: false,
        internalType: 'uint256',
        name: '_type',
        type: 'uint256',
      },
    ],
    name: 'ChangeFee',
    type: 'event',
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: false,
        internalType: 'uint8',
        name: 'version',
        type: 'uint8',
      },
    ],
    name: 'Initialized',
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
        indexed: true,
        internalType: 'address',
        name: 'implementation',
        type: 'address',
      },
    ],
    name: 'Upgraded',
    type: 'event',
  },
  {
    inputs: [],
    name: 'factory',
    outputs: [
      {
        internalType: 'contract IPoolFactory',
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
        name: '',
        type: 'address',
      },
    ],
    name: 'feeRates',
    outputs: [
      {
        internalType: 'uint48',
        name: '',
        type: 'uint48',
      },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      {
        internalType: 'address',
        name: '_pool',
        type: 'address',
      },
    ],
    name: 'getCurrentRate',
    outputs: [
      {
        internalType: 'uint48',
        name: '',
        type: 'uint48',
      },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      {
        internalType: 'address',
        name: '_pool',
        type: 'address',
      },
      {
        internalType: 'uint256',
        name: '_rawPayoutAmount',
        type: 'uint256',
      },
    ],
    name: 'getFee',
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
        internalType: 'contract IPoolFactory',
        name: '_factory',
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
    name: 'proxiableUUID',
    outputs: [
      {
        internalType: 'bytes32',
        name: '',
        type: 'bytes32',
      },
    ],
    stateMutability: 'view',
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
    name: 'rateFunction',
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
    name: 'renounceOwnership',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      {
        internalType: 'address',
        name: '_pool',
        type: 'address',
      },
      {
        internalType: 'uint48',
        name: '_feeRate',
        type: 'uint48',
      },
      {
        internalType: 'uint256',
        name: '_type',
        type: 'uint256',
      },
    ],
    name: 'setPoolFees',
    outputs: [],
    stateMutability: 'nonpayable',
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
        internalType: 'address',
        name: 'newImplementation',
        type: 'address',
      },
    ],
    name: 'upgradeTo',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      {
        internalType: 'address',
        name: 'newImplementation',
        type: 'address',
      },
      {
        internalType: 'bytes',
        name: 'data',
        type: 'bytes',
      },
    ],
    name: 'upgradeToAndCall',
    outputs: [],
    stateMutability: 'payable',
    type: 'function',
  },
  {
    inputs: [],
    name: 'version',
    outputs: [
      {
        internalType: 'uint256',
        name: '',
        type: 'uint256',
      },
    ],
    stateMutability: 'pure',
    type: 'function',
  },
];

module.exports = {
  FeesManagerABI,
};
