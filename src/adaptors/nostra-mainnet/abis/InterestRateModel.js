const interestRateModel = [
  {
    name: 'Uint256',
    size: 2,
    type: 'struct',
    members: [
      {
        name: 'low',
        type: 'felt',
        offset: 0,
      },
      {
        name: 'high',
        type: 'felt',
        offset: 1,
      },
    ],
  },
  {
    name: 'InterestStateEntity',
    size: 9,
    type: 'struct',
    members: [
      {
        name: 'lendingRate',
        type: 'Uint256',
        offset: 0,
      },
      {
        name: 'borrowingRate',
        type: 'Uint256',
        offset: 2,
      },
      {
        name: 'lastUpdateTimestamp',
        type: 'felt',
        offset: 4,
      },
      {
        name: 'lendingIndex',
        type: 'Uint256',
        offset: 5,
      },
      {
        name: 'borrowingIndex',
        type: 'Uint256',
        offset: 7,
      },
    ],
  },
  {
    name: 'InterestRateConfigEntity',
    size: 13,
    type: 'struct',
    members: [
      {
        name: 'optimalUtilizationRate',
        type: 'Uint256',
        offset: 0,
      },
      {
        name: 'baseBorrowingRate',
        type: 'Uint256',
        offset: 2,
      },
      {
        name: 'rateSlope1',
        type: 'Uint256',
        offset: 4,
      },
      {
        name: 'rateSlope2',
        type: 'Uint256',
        offset: 6,
      },
      {
        name: 'generalProtocolFee',
        type: 'Uint256',
        offset: 8,
      },
      {
        name: 'feesRecipient',
        type: 'felt',
        offset: 10,
      },
      {
        name: 'interestBearingToken',
        type: 'felt',
        offset: 11,
      },
      {
        name: 'interestBearingCollateralToken',
        type: 'felt',
        offset: 12,
      },
    ],
  },
  {
    data: [
      {
        name: 'previousOwner',
        type: 'felt',
      },
      {
        name: 'newOwner',
        type: 'felt',
      },
    ],
    keys: [],
    name: 'OwnershipTransferred',
    type: 'event',
  },
  {
    data: [
      {
        name: 'currentOwner',
        type: 'felt',
      },
      {
        name: 'newOwner',
        type: 'felt',
      },
    ],
    keys: [],
    name: 'OwnershipProposed',
    type: 'event',
  },
  {
    data: [
      {
        name: 'caller',
        type: 'felt',
      },
      {
        name: 'pending_owner',
        type: 'felt',
      },
    ],
    keys: [],
    name: 'OwnershipProposalCancelled',
    type: 'event',
  },
  {
    data: [
      {
        name: 'debtToken',
        type: 'felt',
      },
      {
        name: 'optimalUtilizationRate',
        type: 'Uint256',
      },
    ],
    keys: [],
    name: 'InterestRateConfigSetOptimalUtilizationRate',
    type: 'event',
  },
  {
    data: [
      {
        name: 'debtToken',
        type: 'felt',
      },
      {
        name: 'baseBorrowingRate',
        type: 'Uint256',
      },
    ],
    keys: [],
    name: 'InterestRateConfigSetBaseBorrowingRate',
    type: 'event',
  },
  {
    data: [
      {
        name: 'debtToken',
        type: 'felt',
      },
      {
        name: 'rateSlope1',
        type: 'Uint256',
      },
    ],
    keys: [],
    name: 'InterestRateConfigSetRateSlope1',
    type: 'event',
  },
  {
    data: [
      {
        name: 'debtToken',
        type: 'felt',
      },
      {
        name: 'rateSlope2',
        type: 'Uint256',
      },
    ],
    keys: [],
    name: 'InterestRateConfigSetRateSlope2',
    type: 'event',
  },
  {
    data: [
      {
        name: 'debtToken',
        type: 'felt',
      },
      {
        name: 'generalProtocolFee',
        type: 'Uint256',
      },
    ],
    keys: [],
    name: 'InterestRateConfigSetGeneralProtocolFee',
    type: 'event',
  },
  {
    data: [
      {
        name: 'debtToken',
        type: 'felt',
      },
      {
        name: 'interestBearingToken',
        type: 'felt',
      },
    ],
    keys: [],
    name: 'InterestRateConfigSetInterestBearingToken',
    type: 'event',
  },
  {
    data: [
      {
        name: 'debtToken',
        type: 'felt',
      },
      {
        name: 'interestBearingCollateralToken',
        type: 'felt',
      },
    ],
    keys: [],
    name: 'InterestRateConfigSetInterestBearingCollateralToken',
    type: 'event',
  },
  {
    data: [
      {
        name: 'debtToken',
        type: 'felt',
      },
      {
        name: 'lendingRate',
        type: 'Uint256',
      },
    ],
    keys: [],
    name: 'InterestStateSetLendingRate',
    type: 'event',
  },
  {
    data: [
      {
        name: 'debtToken',
        type: 'felt',
      },
      {
        name: 'borrowingRate',
        type: 'Uint256',
      },
    ],
    keys: [],
    name: 'InterestStateSetBorrowingRate',
    type: 'event',
  },
  {
    data: [
      {
        name: 'debtToken',
        type: 'felt',
      },
      {
        name: 'lastUpdateTimestamp',
        type: 'felt',
      },
    ],
    keys: [],
    name: 'InterestStateSetLastUpdateTimestamp',
    type: 'event',
  },
  {
    data: [
      {
        name: 'debtToken',
        type: 'felt',
      },
      {
        name: 'lendingIndex',
        type: 'Uint256',
      },
    ],
    keys: [],
    name: 'InterestStateSetLendingIndex',
    type: 'event',
  },
  {
    data: [
      {
        name: 'debtToken',
        type: 'felt',
      },
      {
        name: 'borrowingIndex',
        type: 'Uint256',
      },
    ],
    keys: [],
    name: 'InterestStateSetBorrowingIndex',
    type: 'event',
  },
  {
    data: [
      {
        name: 'role',
        type: 'felt',
      },
      {
        name: 'account',
        type: 'felt',
      },
      {
        name: 'sender',
        type: 'felt',
      },
    ],
    keys: [],
    name: 'RoleGranted',
    type: 'event',
  },
  {
    data: [
      {
        name: 'role',
        type: 'felt',
      },
      {
        name: 'account',
        type: 'felt',
      },
      {
        name: 'sender',
        type: 'felt',
      },
    ],
    keys: [],
    name: 'RoleRevoked',
    type: 'event',
  },
  {
    data: [
      {
        name: 'role',
        type: 'felt',
      },
      {
        name: 'previousAdminRole',
        type: 'felt',
      },
      {
        name: 'newAdminRole',
        type: 'felt',
      },
    ],
    keys: [],
    name: 'RoleAdminChanged',
    type: 'event',
  },
  {
    data: [
      {
        name: 'debtToken',
        type: 'felt',
      },
      {
        name: 'lendingRate',
        type: 'Uint256',
      },
      {
        name: 'borrowingRate',
        type: 'Uint256',
      },
      {
        name: 'lendingIndex',
        type: 'Uint256',
      },
      {
        name: 'borrowingIndex',
        type: 'Uint256',
      },
    ],
    keys: [],
    name: 'InterestStateUpdated',
    type: 'event',
  },
  {
    name: 'getInterestState',
    type: 'function',
    inputs: [
      {
        name: 'debtToken',
        type: 'felt',
      },
    ],
    outputs: [
      {
        name: 'interestState',
        type: 'InterestStateEntity',
      },
    ],
    stateMutability: 'view',
  },
  {
    name: 'getInterestRateConfig',
    type: 'function',
    inputs: [
      {
        name: 'debtToken',
        type: 'felt',
      },
    ],
    outputs: [
      {
        name: 'interestRateConfig',
        type: 'InterestRateConfigEntity',
      },
    ],
    stateMutability: 'view',
  },
  {
    name: 'getBorrowingIndex',
    type: 'function',
    inputs: [
      {
        name: 'debtToken',
        type: 'felt',
      },
    ],
    outputs: [
      {
        name: 'borrowingIndex',
        type: 'Uint256',
      },
    ],
    stateMutability: 'view',
  },
  {
    name: 'getLendingIndex',
    type: 'function',
    inputs: [
      {
        name: 'debtToken',
        type: 'felt',
      },
    ],
    outputs: [
      {
        name: 'lendingIndex',
        type: 'Uint256',
      },
    ],
    stateMutability: 'view',
  },
  {
    name: 'hasRole',
    type: 'function',
    inputs: [
      {
        name: 'role',
        type: 'felt',
      },
      {
        name: 'user',
        type: 'felt',
      },
    ],
    outputs: [
      {
        name: 'hasRole',
        type: 'felt',
      },
    ],
    stateMutability: 'view',
  },
  {
    name: 'owner',
    type: 'function',
    inputs: [],
    outputs: [
      {
        name: 'owner',
        type: 'felt',
      },
    ],
    stateMutability: 'view',
  },
  {
    name: 'pendingOwner',
    type: 'function',
    inputs: [],
    outputs: [
      {
        name: 'pending_owner',
        type: 'felt',
      },
    ],
    stateMutability: 'view',
  },
  {
    name: 'constructor',
    type: 'constructor',
    inputs: [
      {
        name: 'owner',
        type: 'felt',
      },
    ],
    outputs: [],
  },
  {
    name: 'replaceClass',
    type: 'function',
    inputs: [
      {
        name: 'class_hash',
        type: 'felt',
      },
    ],
    outputs: [],
  },
  {
    name: 'initMarket',
    type: 'function',
    inputs: [
      {
        name: 'debtToken',
        type: 'felt',
      },
      {
        name: 'interestBearingToken',
        type: 'felt',
      },
      {
        name: 'interestBearingCollateralToken',
        type: 'felt',
      },
      {
        name: 'optimalUtilizationRate',
        type: 'Uint256',
      },
      {
        name: 'baseBorrowingRate',
        type: 'Uint256',
      },
      {
        name: 'rateSlope1',
        type: 'Uint256',
      },
      {
        name: 'rateSlope2',
        type: 'Uint256',
      },
      {
        name: 'generalProtocolFee',
        type: 'Uint256',
      },
      {
        name: 'feesRecipient',
        type: 'felt',
      },
    ],
    outputs: [],
  },
  {
    name: 'configureDebt',
    type: 'function',
    inputs: [
      {
        name: 'debtToken',
        type: 'felt',
      },
      {
        name: 'optimalUtilizationRate',
        type: 'Uint256',
      },
      {
        name: 'baseBorrowingRate',
        type: 'Uint256',
      },
      {
        name: 'rateSlope1',
        type: 'Uint256',
      },
      {
        name: 'rateSlope2',
        type: 'Uint256',
      },
      {
        name: 'generalProtocolFee',
        type: 'Uint256',
      },
      {
        name: 'feesRecipient',
        type: 'felt',
      },
    ],
    outputs: [],
  },
  {
    name: 'accrueInterest',
    type: 'function',
    inputs: [
      {
        name: 'debtToken',
        type: 'felt',
      },
    ],
    outputs: [],
  },
  {
    name: 'onLiquidityChange',
    type: 'function',
    inputs: [
      {
        name: 'debtToken',
        type: 'felt',
      },
    ],
    outputs: [],
  },
  {
    name: 'releaseUnderlying',
    type: 'function',
    inputs: [
      {
        name: 'debtToken',
        type: 'felt',
      },
      {
        name: 'recipient',
        type: 'felt',
      },
      {
        name: 'amount',
        type: 'Uint256',
      },
    ],
    outputs: [],
  },
  {
    name: 'grantRole',
    type: 'function',
    inputs: [
      {
        name: 'role',
        type: 'felt',
      },
      {
        name: 'user',
        type: 'felt',
      },
    ],
    outputs: [],
  },
  {
    name: 'revokeRole',
    type: 'function',
    inputs: [
      {
        name: 'role',
        type: 'felt',
      },
      {
        name: 'user',
        type: 'felt',
      },
    ],
    outputs: [],
  },
  {
    name: 'renounceRole',
    type: 'function',
    inputs: [
      {
        name: 'role',
        type: 'felt',
      },
      {
        name: 'user',
        type: 'felt',
      },
    ],
    outputs: [],
  },
  {
    name: 'transferOwnership',
    type: 'function',
    inputs: [
      {
        name: 'pendingOwner',
        type: 'felt',
      },
    ],
    outputs: [],
  },
  {
    name: 'acceptOwnership',
    type: 'function',
    inputs: [],
    outputs: [],
  },
  {
    name: 'cancelOwnershipProposal',
    type: 'function',
    inputs: [],
    outputs: [],
  },
];

const interestRateModelAbi = {};
interestRateModel.forEach((i) => (interestRateModelAbi[i.name] = i));

module.exports = {
  interestRateModelAbi,
};
