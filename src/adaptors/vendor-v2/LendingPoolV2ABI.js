module.exports = [
  {
    inputs: [],
    name: 'BorrowingPaused',
    type: 'error',
  },
  {
    inputs: [],
    name: 'DebtIsLess',
    type: 'error',
  },
  {
    inputs: [],
    name: 'FailedStrategyWithdraw',
    type: 'error',
  },
  {
    inputs: [],
    name: 'FeeTooHigh',
    type: 'error',
  },
  {
    inputs: [],
    name: 'ImplementationNotWhitelisted',
    type: 'error',
  },
  {
    inputs: [],
    name: 'InvalidCollateralReceived',
    type: 'error',
  },
  {
    inputs: [],
    name: 'InvalidParameters',
    type: 'error',
  },
  {
    inputs: [],
    name: 'NoDebt',
    type: 'error',
  },
  {
    inputs: [],
    name: 'NotEnoughLiquidity',
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
    name: 'NotPrivatePool',
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
    name: 'PoolExpired',
    type: 'error',
  },
  {
    inputs: [],
    name: 'PoolNotWhitelisted',
    type: 'error',
  },
  {
    inputs: [],
    name: 'PoolStillActive',
    type: 'error',
  },
  {
    inputs: [],
    name: 'PrivatePool',
    type: 'error',
  },
  {
    inputs: [],
    name: 'RolloverPartialAmountNotSupported',
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
        indexed: false,
        internalType: 'address',
        name: 'token',
        type: 'address',
      },
      {
        indexed: false,
        internalType: 'address',
        name: 'to',
        type: 'address',
      },
      {
        indexed: false,
        internalType: 'bool',
        name: 'incoming',
        type: 'bool',
      },
      {
        indexed: false,
        internalType: 'uint256',
        name: 'amount',
        type: 'uint256',
      },
    ],
    name: 'BalanceChange',
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
        indexed: true,
        internalType: 'address',
        name: 'borrower',
        type: 'address',
      },
      {
        indexed: false,
        internalType: 'uint256',
        name: 'vendorFees',
        type: 'uint256',
      },
      {
        indexed: false,
        internalType: 'uint256',
        name: 'lenderFees',
        type: 'uint256',
      },
      {
        indexed: false,
        internalType: 'uint48',
        name: 'borrowRate',
        type: 'uint48',
      },
      {
        indexed: false,
        internalType: 'uint256',
        name: 'additionalColAmount',
        type: 'uint256',
      },
      {
        indexed: false,
        internalType: 'uint256',
        name: 'additionalDebt',
        type: 'uint256',
      },
    ],
    name: 'Borrow',
    type: 'event',
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: 'address',
        name: 'lender',
        type: 'address',
      },
      {
        indexed: false,
        internalType: 'uint256',
        name: 'lenderLend',
        type: 'uint256',
      },
      {
        indexed: false,
        internalType: 'uint256',
        name: 'lenderCol',
        type: 'uint256',
      },
    ],
    name: 'Collect',
    type: 'event',
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: 'address',
        name: 'lender',
        type: 'address',
      },
      {
        indexed: false,
        internalType: 'uint256',
        name: 'amount',
        type: 'uint256',
      },
    ],
    name: 'Deposit',
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
        indexed: false,
        internalType: 'address',
        name: 'oldOwner',
        type: 'address',
      },
      {
        indexed: false,
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
        internalType: 'uint48',
        name: 'timestamp',
        type: 'uint48',
      },
    ],
    name: 'Pause',
    type: 'event',
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: 'address',
        name: 'borrower',
        type: 'address',
      },
      {
        indexed: false,
        internalType: 'uint256',
        name: 'debtRepaid',
        type: 'uint256',
      },
      {
        indexed: false,
        internalType: 'uint256',
        name: 'colReturned',
        type: 'uint256',
      },
    ],
    name: 'Repay',
    type: 'event',
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: 'address',
        name: 'borrower',
        type: 'address',
      },
      {
        indexed: false,
        internalType: 'address',
        name: 'originPool',
        type: 'address',
      },
      {
        indexed: false,
        internalType: 'uint256',
        name: 'originDebt',
        type: 'uint256',
      },
      {
        indexed: false,
        internalType: 'uint256',
        name: 'lendToRepay',
        type: 'uint256',
      },
      {
        indexed: false,
        internalType: 'uint256',
        name: 'lenderFeeAmt',
        type: 'uint256',
      },
      {
        indexed: false,
        internalType: 'uint256',
        name: 'protocolFeeAmt',
        type: 'uint256',
      },
      {
        indexed: false,
        internalType: 'uint256',
        name: 'colRolled',
        type: 'uint256',
      },
      {
        indexed: false,
        internalType: 'uint256',
        name: 'colToReimburse',
        type: 'uint256',
      },
    ],
    name: 'RollIn',
    type: 'event',
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: false,
        internalType: 'address',
        name: 'pool',
        type: 'address',
      },
      {
        indexed: false,
        internalType: 'bool',
        name: 'enabled',
        type: 'bool',
      },
    ],
    name: 'RolloverPoolSet',
    type: 'event',
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: 'address',
        name: 'borrower',
        type: 'address',
      },
      {
        indexed: false,
        internalType: 'bool',
        name: 'allowed',
        type: 'bool',
      },
    ],
    name: 'UpdateBorrower',
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
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: 'address',
        name: 'lender',
        type: 'address',
      },
      {
        indexed: false,
        internalType: 'uint256',
        name: 'amount',
        type: 'uint256',
      },
    ],
    name: 'Withdraw',
    type: 'event',
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: false,
        internalType: 'uint256',
        name: 'sharesAmount',
        type: 'uint256',
      },
    ],
    name: 'WithdrawStrategyTokens',
    type: 'event',
  },
  {
    inputs: [
      {
        internalType: 'address',
        name: '',
        type: 'address',
      },
    ],
    name: 'allowedBorrowers',
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
        name: '',
        type: 'address',
      },
    ],
    name: 'allowedRollovers',
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
        name: '_borrower',
        type: 'address',
      },
      {
        internalType: 'uint256',
        name: '_colDepositAmount',
        type: 'uint256',
      },
      {
        internalType: 'uint48',
        name: '_rate',
        type: 'uint48',
      },
    ],
    name: 'borrowOnBehalfOf',
    outputs: [
      {
        internalType: 'uint256',
        name: 'assetsBorrowed',
        type: 'uint256',
      },
      {
        internalType: 'uint256',
        name: 'lenderFees',
        type: 'uint256',
      },
      {
        internalType: 'uint256',
        name: 'vendorFees',
        type: 'uint256',
      },
    ],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [],
    name: 'claimOwnership',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [],
    name: 'colBalance',
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
    name: 'collect',
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
    name: 'debts',
    outputs: [
      {
        internalType: 'uint256',
        name: 'debt',
        type: 'uint256',
      },
      {
        internalType: 'uint256',
        name: 'colAmount',
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
        name: '_depositAmount',
        type: 'uint256',
      },
    ],
    name: 'deposit',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
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
    inputs: [],
    name: 'feesManager',
    outputs: [
      {
        internalType: 'contract IFeesManager',
        name: '',
        type: 'address',
      },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'getPoolSettings',
    outputs: [
      {
        components: [
          {
            internalType: 'enum PoolType',
            name: 'poolType',
            type: 'uint8',
          },
          {
            internalType: 'address',
            name: 'owner',
            type: 'address',
          },
          {
            internalType: 'uint48',
            name: 'expiry',
            type: 'uint48',
          },
          {
            internalType: 'contract IERC20MetadataUpgradeable',
            name: 'colToken',
            type: 'address',
          },
          {
            internalType: 'uint48',
            name: 'protocolFee',
            type: 'uint48',
          },
          {
            internalType: 'contract IERC20MetadataUpgradeable',
            name: 'lendToken',
            type: 'address',
          },
          {
            internalType: 'uint48',
            name: 'ltv',
            type: 'uint48',
          },
          {
            internalType: 'uint48',
            name: 'pauseTime',
            type: 'uint48',
          },
          {
            internalType: 'uint256',
            name: 'lendRatio',
            type: 'uint256',
          },
          {
            internalType: 'address[]',
            name: 'allowlist',
            type: 'address[]',
          },
          {
            internalType: 'bytes32',
            name: 'feeRatesAndType',
            type: 'bytes32',
          },
        ],
        internalType: 'struct GeneralPoolSettings',
        name: '',
        type: 'tuple',
      },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      {
        internalType: 'address',
        name: '_newOwner',
        type: 'address',
      },
    ],
    name: 'grantOwnership',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      {
        internalType: 'bytes',
        name: '_factoryParametersBytes',
        type: 'bytes',
      },
      {
        internalType: 'bytes',
        name: '_poolSettingsBytes',
        type: 'bytes',
      },
      {
        internalType: 'bytes',
        name: '',
        type: 'bytes',
      },
    ],
    name: 'initialize',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [],
    name: 'lendBalance',
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
    name: 'lenderTotalFees',
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
    name: 'oracle',
    outputs: [
      {
        internalType: 'contract IOracle',
        name: '',
        type: 'address',
      },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'poolSettings',
    outputs: [
      {
        internalType: 'enum PoolType',
        name: 'poolType',
        type: 'uint8',
      },
      {
        internalType: 'address',
        name: 'owner',
        type: 'address',
      },
      {
        internalType: 'uint48',
        name: 'expiry',
        type: 'uint48',
      },
      {
        internalType: 'contract IERC20MetadataUpgradeable',
        name: 'colToken',
        type: 'address',
      },
      {
        internalType: 'uint48',
        name: 'protocolFee',
        type: 'uint48',
      },
      {
        internalType: 'contract IERC20MetadataUpgradeable',
        name: 'lendToken',
        type: 'address',
      },
      {
        internalType: 'uint48',
        name: 'ltv',
        type: 'uint48',
      },
      {
        internalType: 'uint48',
        name: 'pauseTime',
        type: 'uint48',
      },
      {
        internalType: 'uint256',
        name: 'lendRatio',
        type: 'uint256',
      },
      {
        internalType: 'bytes32',
        name: 'feeRatesAndType',
        type: 'bytes32',
      },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'positionTracker',
    outputs: [
      {
        internalType: 'contract IPositionTracker',
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
        name: '_borrower',
        type: 'address',
      },
      {
        internalType: 'uint256',
        name: '_repayAmount',
        type: 'uint256',
      },
    ],
    name: 'repayOnBehalfOf',
    outputs: [
      {
        internalType: 'uint256',
        name: 'lendTokenReceived',
        type: 'uint256',
      },
      {
        internalType: 'uint256',
        name: 'colReturnAmount',
        type: 'uint256',
      },
    ],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      {
        internalType: 'address',
        name: '_originPool',
        type: 'address',
      },
      {
        internalType: 'uint256',
        name: '_originDebt',
        type: 'uint256',
      },
      {
        internalType: 'uint48',
        name: '_rate',
        type: 'uint48',
      },
    ],
    name: 'rollInFrom',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      {
        internalType: 'uint48',
        name: '_timestamp',
        type: 'uint48',
      },
    ],
    name: 'setPauseBorrowing',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      {
        internalType: 'bytes32',
        name: '_ratesAndType',
        type: 'bytes32',
      },
    ],
    name: 'setPoolRates',
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
        internalType: 'bool',
        name: '_enabled',
        type: 'bool',
      },
    ],
    name: 'setRolloverPool',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [],
    name: 'strategy',
    outputs: [
      {
        internalType: 'contract IStrategy',
        name: '',
        type: 'address',
      },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'treasury',
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
        name: '_borrower',
        type: 'address',
      },
      {
        internalType: 'bool',
        name: '_allowed',
        type: 'bool',
      },
    ],
    name: 'updateBorrower',
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
  {
    inputs: [
      {
        internalType: 'uint256',
        name: '_withdrawAmount',
        type: 'uint256',
      },
    ],
    name: 'withdraw',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [],
    name: 'withdrawStrategyTokens',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
];
