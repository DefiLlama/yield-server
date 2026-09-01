const warRedeemerAbi = [
  {
    inputs: [
      {
        internalType: 'address',
        name: '_war',
        type: 'address'
      },
      {
        internalType: 'address',
        name: '_ratios',
        type: 'address'
      },
      {
        internalType: 'address',
        name: '_feeReceiver',
        type: 'address'
      },
      {
        internalType: 'uint256',
        name: '_redeemFee',
        type: 'uint256'
      }
    ],
    stateMutability: 'nonpayable',
    type: 'constructor'
  },
  {
    inputs: [],
    name: 'AlreadyRedeemed',
    type: 'error'
  },
  {
    inputs: [],
    name: 'CallerNotPendingOwner',
    type: 'error'
  },
  {
    inputs: [],
    name: 'CannotBeOwner',
    type: 'error'
  },
  {
    inputs: [],
    name: 'CannotRedeemYet',
    type: 'error'
  },
  {
    inputs: [],
    name: 'EmptyArray',
    type: 'error'
  },
  {
    inputs: [],
    name: 'InvalidIndex',
    type: 'error'
  },
  {
    inputs: [],
    name: 'InvalidParameter',
    type: 'error'
  },
  {
    inputs: [
      {
        internalType: 'address',
        name: 'expected',
        type: 'address'
      },
      {
        internalType: 'address',
        name: 'actual',
        type: 'address'
      }
    ],
    name: 'MismatchingLocker',
    type: 'error'
  },
  {
    inputs: [],
    name: 'NotListedLocker',
    type: 'error'
  },
  {
    inputs: [],
    name: 'OwnerAddressZero',
    type: 'error'
  },
  {
    inputs: [],
    name: 'RecoverForbidden',
    type: 'error'
  },
  {
    inputs: [],
    name: 'ZeroAddress',
    type: 'error'
  },
  {
    inputs: [],
    name: 'ZeroValue',
    type: 'error'
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: false,
        internalType: 'address',
        name: 'oldFeeReceiver',
        type: 'address'
      },
      {
        indexed: false,
        internalType: 'address',
        name: 'newFeeReceiver',
        type: 'address'
      }
    ],
    name: 'FeeReceiverUpdated',
    type: 'event'
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: false,
        internalType: 'address',
        name: 'oldMintRatio',
        type: 'address'
      },
      {
        indexed: false,
        internalType: 'address',
        name: 'newMintRatio',
        type: 'address'
      }
    ],
    name: 'MintRatioUpdated',
    type: 'event'
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: 'address',
        name: 'previousPendingOwner',
        type: 'address'
      },
      {
        indexed: true,
        internalType: 'address',
        name: 'newPendingOwner',
        type: 'address'
      }
    ],
    name: 'NewPendingOwner',
    type: 'event'
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: 'address',
        name: 'token',
        type: 'address'
      },
      {
        indexed: true,
        internalType: 'address',
        name: 'user',
        type: 'address'
      },
      {
        indexed: false,
        internalType: 'uint256',
        name: 'id',
        type: 'uint256'
      },
      {
        indexed: false,
        internalType: 'uint256',
        name: 'amount',
        type: 'uint256'
      },
      {
        indexed: false,
        internalType: 'uint256',
        name: 'redeemIndex',
        type: 'uint256'
      }
    ],
    name: 'NewRedeemTicket',
    type: 'event'
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: 'address',
        name: 'previousOwner',
        type: 'address'
      },
      {
        indexed: true,
        internalType: 'address',
        name: 'newOwner',
        type: 'address'
      }
    ],
    name: 'OwnershipTransferred',
    type: 'event'
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: false,
        internalType: 'address',
        name: 'account',
        type: 'address'
      }
    ],
    name: 'Paused',
    type: 'event'
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: false,
        internalType: 'uint256',
        name: 'oldRedeemFee',
        type: 'uint256'
      },
      {
        indexed: false,
        internalType: 'uint256',
        name: 'newRedeemFee',
        type: 'uint256'
      }
    ],
    name: 'RedeemFeeUpdated',
    type: 'event'
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: 'address',
        name: 'token',
        type: 'address'
      },
      {
        indexed: true,
        internalType: 'address',
        name: 'user',
        type: 'address'
      },
      {
        indexed: false,
        internalType: 'address',
        name: 'receiver',
        type: 'address'
      },
      {
        indexed: true,
        internalType: 'uint256',
        name: 'ticketNumber',
        type: 'uint256'
      }
    ],
    name: 'Redeemed',
    type: 'event'
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: 'address',
        name: 'token',
        type: 'address'
      },
      {
        indexed: true,
        internalType: 'address',
        name: 'locker',
        type: 'address'
      }
    ],
    name: 'SetWarLocker',
    type: 'event'
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: false,
        internalType: 'address',
        name: 'account',
        type: 'address'
      }
    ],
    name: 'Unpaused',
    type: 'event'
  },
  {
    inputs: [],
    name: 'MAX_BPS',
    outputs: [
      {
        internalType: 'uint256',
        name: '',
        type: 'uint256'
      }
    ],
    stateMutability: 'view',
    type: 'function'
  },
  {
    inputs: [],
    name: 'UNIT',
    outputs: [
      {
        internalType: 'uint256',
        name: '',
        type: 'uint256'
      }
    ],
    stateMutability: 'view',
    type: 'function'
  },
  {
    inputs: [],
    name: 'acceptOwnership',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function'
  },
  {
    inputs: [],
    name: 'feeReceiver',
    outputs: [
      {
        internalType: 'address',
        name: '',
        type: 'address'
      }
    ],
    stateMutability: 'view',
    type: 'function'
  },
  {
    inputs: [],
    name: 'getTokenWeights',
    outputs: [
      {
        components: [
          {
            internalType: 'address',
            name: 'token',
            type: 'address'
          },
          {
            internalType: 'uint256',
            name: 'weight',
            type: 'uint256'
          }
        ],
        internalType: 'struct WarRedeemer.TokenWeight[]',
        name: '',
        type: 'tuple[]'
      }
    ],
    stateMutability: 'view',
    type: 'function'
  },
  {
    inputs: [
      {
        internalType: 'address',
        name: 'user',
        type: 'address'
      }
    ],
    name: 'getUserActiveRedeemTickets',
    outputs: [
      {
        components: [
          {
            internalType: 'uint256',
            name: 'id',
            type: 'uint256'
          },
          {
            internalType: 'uint256',
            name: 'amount',
            type: 'uint256'
          },
          {
            internalType: 'uint256',
            name: 'redeemIndex',
            type: 'uint256'
          },
          {
            internalType: 'address',
            name: 'token',
            type: 'address'
          },
          {
            internalType: 'bool',
            name: 'redeemed',
            type: 'bool'
          }
        ],
        internalType: 'struct WarRedeemer.RedeemTicket[]',
        name: '',
        type: 'tuple[]'
      }
    ],
    stateMutability: 'view',
    type: 'function'
  },
  {
    inputs: [
      {
        internalType: 'address',
        name: 'user',
        type: 'address'
      }
    ],
    name: 'getUserRedeemTickets',
    outputs: [
      {
        components: [
          {
            internalType: 'uint256',
            name: 'id',
            type: 'uint256'
          },
          {
            internalType: 'uint256',
            name: 'amount',
            type: 'uint256'
          },
          {
            internalType: 'uint256',
            name: 'redeemIndex',
            type: 'uint256'
          },
          {
            internalType: 'address',
            name: 'token',
            type: 'address'
          },
          {
            internalType: 'bool',
            name: 'redeemed',
            type: 'bool'
          }
        ],
        internalType: 'struct WarRedeemer.RedeemTicket[]',
        name: '',
        type: 'tuple[]'
      }
    ],
    stateMutability: 'view',
    type: 'function'
  },
  {
    inputs: [
      {
        internalType: 'uint256',
        name: 'amount',
        type: 'uint256'
      }
    ],
    name: 'joinQueue',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function'
  },
  {
    inputs: [
      {
        internalType: 'address',
        name: '',
        type: 'address'
      }
    ],
    name: 'lockerTokens',
    outputs: [
      {
        internalType: 'address',
        name: '',
        type: 'address'
      }
    ],
    stateMutability: 'view',
    type: 'function'
  },
  {
    inputs: [
      {
        internalType: 'address',
        name: '',
        type: 'address'
      }
    ],
    name: 'lockers',
    outputs: [
      {
        internalType: 'address',
        name: '',
        type: 'address'
      }
    ],
    stateMutability: 'view',
    type: 'function'
  },
  {
    inputs: [
      {
        internalType: 'address',
        name: 'token',
        type: 'address'
      },
      {
        internalType: 'uint256',
        name: 'amount',
        type: 'uint256'
      }
    ],
    name: 'notifyUnlock',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function'
  },
  {
    inputs: [],
    name: 'owner',
    outputs: [
      {
        internalType: 'address',
        name: '',
        type: 'address'
      }
    ],
    stateMutability: 'view',
    type: 'function'
  },
  {
    inputs: [],
    name: 'pause',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function'
  },
  {
    inputs: [],
    name: 'paused',
    outputs: [
      {
        internalType: 'bool',
        name: '',
        type: 'bool'
      }
    ],
    stateMutability: 'view',
    type: 'function'
  },
  {
    inputs: [],
    name: 'pendingOwner',
    outputs: [
      {
        internalType: 'address',
        name: '',
        type: 'address'
      }
    ],
    stateMutability: 'view',
    type: 'function'
  },
  {
    inputs: [
      {
        internalType: 'address',
        name: 'token',
        type: 'address'
      }
    ],
    name: 'queuedForWithdrawal',
    outputs: [
      {
        internalType: 'uint256',
        name: '',
        type: 'uint256'
      }
    ],
    stateMutability: 'view',
    type: 'function'
  },
  {
    inputs: [],
    name: 'ratios',
    outputs: [
      {
        internalType: 'contract IRatios',
        name: '',
        type: 'address'
      }
    ],
    stateMutability: 'view',
    type: 'function'
  },
  {
    inputs: [
      {
        internalType: 'address',
        name: 'token',
        type: 'address'
      }
    ],
    name: 'recoverERC20',
    outputs: [
      {
        internalType: 'bool',
        name: '',
        type: 'bool'
      }
    ],
    stateMutability: 'nonpayable',
    type: 'function'
  },
  {
    inputs: [
      {
        internalType: 'uint256[]',
        name: 'tickets',
        type: 'uint256[]'
      },
      {
        internalType: 'address',
        name: 'receiver',
        type: 'address'
      }
    ],
    name: 'redeem',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function'
  },
  {
    inputs: [],
    name: 'redeemFee',
    outputs: [
      {
        internalType: 'uint256',
        name: '',
        type: 'uint256'
      }
    ],
    stateMutability: 'view',
    type: 'function'
  },
  {
    inputs: [],
    name: 'renounceOwnership',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function'
  },
  {
    inputs: [
      {
        internalType: 'address',
        name: 'newFeeReceiver',
        type: 'address'
      }
    ],
    name: 'setFeeReceiver',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function'
  },
  {
    inputs: [
      {
        internalType: 'address',
        name: 'token',
        type: 'address'
      },
      {
        internalType: 'address',
        name: 'warLocker',
        type: 'address'
      }
    ],
    name: 'setLocker',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function'
  },
  {
    inputs: [
      {
        internalType: 'address',
        name: 'newRatios',
        type: 'address'
      }
    ],
    name: 'setRatios',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function'
  },
  {
    inputs: [
      {
        internalType: 'uint256',
        name: 'newRedeemFee',
        type: 'uint256'
      }
    ],
    name: 'setRedeemFee',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function'
  },
  {
    inputs: [
      {
        internalType: 'address',
        name: '',
        type: 'address'
      }
    ],
    name: 'tokenIndexes',
    outputs: [
      {
        internalType: 'uint256',
        name: 'queueIndex',
        type: 'uint256'
      },
      {
        internalType: 'uint256',
        name: 'redeemIndex',
        type: 'uint256'
      }
    ],
    stateMutability: 'view',
    type: 'function'
  },
  {
    inputs: [
      {
        internalType: 'uint256',
        name: '',
        type: 'uint256'
      }
    ],
    name: 'tokens',
    outputs: [
      {
        internalType: 'address',
        name: '',
        type: 'address'
      }
    ],
    stateMutability: 'view',
    type: 'function'
  },
  {
    inputs: [
      {
        internalType: 'address',
        name: 'newOwner',
        type: 'address'
      }
    ],
    name: 'transferOwnership',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function'
  },
  {
    inputs: [],
    name: 'unpause',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function'
  },
  {
    inputs: [
      {
        internalType: 'address',
        name: '',
        type: 'address'
      },
      {
        internalType: 'uint256',
        name: '',
        type: 'uint256'
      }
    ],
    name: 'userRedeems',
    outputs: [
      {
        internalType: 'uint256',
        name: 'id',
        type: 'uint256'
      },
      {
        internalType: 'uint256',
        name: 'amount',
        type: 'uint256'
      },
      {
        internalType: 'uint256',
        name: 'redeemIndex',
        type: 'uint256'
      },
      {
        internalType: 'address',
        name: 'token',
        type: 'address'
      },
      {
        internalType: 'bool',
        name: 'redeemed',
        type: 'bool'
      }
    ],
    stateMutability: 'view',
    type: 'function'
  },
  {
    inputs: [],
    name: 'war',
    outputs: [
      {
        internalType: 'address',
        name: '',
        type: 'address'
      }
    ],
    stateMutability: 'view',
    type: 'function'
  }
];

module.exports = { warRedeemerAbi };
