module.exports = [
  {
    inputs: [
      {
        internalType: 'address',
        name: '_diamond',
        type: 'address',
      },
      {
        internalType: 'address',
        name: '_premia',
        type: 'address',
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
        name: 'user',
        type: 'address',
      },
      {
        indexed: true,
        internalType: 'address',
        name: 'pool',
        type: 'address',
      },
      {
        indexed: true,
        internalType: 'bool',
        name: 'isCallPool',
        type: 'bool',
      },
      {
        indexed: false,
        internalType: 'uint256',
        name: 'rewardAmount',
        type: 'uint256',
      },
    ],
    name: 'Claim',
    type: 'event',
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: 'address',
        name: 'pool',
        type: 'address',
      },
      {
        indexed: false,
        internalType: 'uint256',
        name: 'allocPoints',
        type: 'uint256',
      },
    ],
    name: 'UpdatePoolAlloc',
    type: 'event',
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
        name: '_allocPoints',
        type: 'uint256',
      },
    ],
    name: 'addPool',
    outputs: [],
    stateMutability: 'nonpayable',
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
    name: 'addPremiaRewards',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      {
        internalType: 'address',
        name: '_user',
        type: 'address',
      },
      {
        internalType: 'address',
        name: '_pool',
        type: 'address',
      },
      {
        internalType: 'bool',
        name: '_isCallPool',
        type: 'bool',
      },
      {
        internalType: 'uint256',
        name: '_userTVLOld',
        type: 'uint256',
      },
      {
        internalType: 'uint256',
        name: '_userTVLNew',
        type: 'uint256',
      },
      {
        internalType: 'uint256',
        name: '_totalTVL',
        type: 'uint256',
      },
    ],
    name: 'allocatePending',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      {
        internalType: 'address',
        name: '_user',
        type: 'address',
      },
      {
        internalType: 'address',
        name: '_pool',
        type: 'address',
      },
      {
        internalType: 'bool',
        name: '_isCallPool',
        type: 'bool',
      },
      {
        internalType: 'uint256',
        name: '_userTVLOld',
        type: 'uint256',
      },
      {
        internalType: 'uint256',
        name: '_userTVLNew',
        type: 'uint256',
      },
      {
        internalType: 'uint256',
        name: '_totalTVL',
        type: 'uint256',
      },
    ],
    name: 'claim',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      {
        internalType: 'address',
        name: 'pool',
        type: 'address',
      },
      {
        internalType: 'bool',
        name: 'isCallPool',
        type: 'bool',
      },
    ],
    name: 'getPoolInfo',
    outputs: [
      {
        components: [
          {
            internalType: 'uint256',
            name: 'allocPoint',
            type: 'uint256',
          },
          {
            internalType: 'uint256',
            name: 'lastRewardTimestamp',
            type: 'uint256',
          },
          {
            internalType: 'uint256',
            name: 'accPremiaPerShare',
            type: 'uint256',
          },
        ],
        internalType: 'struct PremiaMiningStorage.PoolInfo',
        name: '',
        type: 'tuple',
      },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'getPremiaPerYear',
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
    name: 'getTotalAllocationPoints',
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
        name: 'account',
        type: 'address',
      },
      {
        internalType: 'address[]',
        name: 'pools',
        type: 'address[]',
      },
      {
        internalType: 'bool[]',
        name: 'isCall',
        type: 'bool[]',
      },
    ],
    name: 'multiClaim',
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
        name: '_isCallPool',
        type: 'bool',
      },
      {
        internalType: 'address',
        name: '_user',
        type: 'address',
      },
    ],
    name: 'pendingPremia',
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
    name: 'premiaRewardsAvailable',
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
        internalType: 'address[]',
        name: '_pools',
        type: 'address[]',
      },
      {
        internalType: 'uint256[]',
        name: '_allocPoints',
        type: 'uint256[]',
      },
    ],
    name: 'setPoolAllocPoints',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      {
        internalType: 'uint256',
        name: '_premiaPerYear',
        type: 'uint256',
      },
    ],
    name: 'setPremiaPerYear',
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
        name: '_isCallPool',
        type: 'bool',
      },
      {
        internalType: 'uint256',
        name: '_totalTVL',
        type: 'uint256',
      },
    ],
    name: 'updatePool',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      {
        internalType: 'address[]',
        name: '_pools',
        type: 'address[]',
      },
      {
        internalType: 'uint256',
        name: '_premiaPerYear',
        type: 'uint256',
      },
    ],
    name: 'upgrade',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
];
