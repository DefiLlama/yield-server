module.exports = [
  {
    inputs: [
      {
        internalType: 'contract IYield',
        name: 'yieldSrc',
        type: 'address',
      },
    ],
    name: 'addYield',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [],
    name: 'allYields',
    outputs: [
      {
        internalType: 'address[]',
        name: '',
        type: 'address[]',
      },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      {
        internalType: 'contract IERC20',
        name: 'asset',
        type: 'address',
      },
    ],
    name: 'assetAPR',
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
        internalType: 'contract IERC20',
        name: 'asset',
        type: 'address',
      },
      {
        internalType: 'uint256',
        name: 'user',
        type: 'uint256',
      },
    ],
    name: 'balanceOf',
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
        internalType: 'contract IERC20',
        name: 'asset',
        type: 'address',
      },
      {
        internalType: 'uint256',
        name: 'user',
        type: 'uint256',
      },
      {
        internalType: 'uint256',
        name: 'amount',
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
    name: 'feeAccount',
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
        internalType: 'contract IERC20',
        name: 'asset',
        type: 'address',
      },
      {
        internalType: 'uint256',
        name: 'user',
        type: 'uint256',
      },
    ],
    name: 'fullWithdraw',
    outputs: [
      {
        internalType: 'uint256',
        name: '',
        type: 'uint256',
      },
    ],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      {
        internalType: 'contract IERC20',
        name: 'asset',
        type: 'address',
      },
    ],
    name: 'offsets',
    outputs: [
      {
        components: [
          {
            internalType: 'contract IYield',
            name: 'yieldSrc',
            type: 'address',
          },
          {
            internalType: 'uint256',
            name: 'apr',
            type: 'uint256',
          },
          {
            internalType: 'uint256',
            name: 'offset',
            type: 'uint256',
          },
          {
            internalType: 'enum OffsetState',
            name: 'state',
            type: 'uint8',
          },
        ],
        internalType: 'struct Offset[]',
        name: 'arr',
        type: 'tuple[]',
      },
      {
        internalType: 'uint256',
        name: 'totalNegative',
        type: 'uint256',
      },
      {
        internalType: 'uint256',
        name: 'totalPositive',
        type: 'uint256',
      },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'performanceFee',
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
        name: 'newPerformanceFee',
        type: 'uint256',
      },
    ],
    name: 'setPerformanceFee',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      {
        internalType: 'contract IYield',
        name: 'yieldSrc',
        type: 'address',
      },
      {
        internalType: 'bool',
        name: 'state',
        type: 'bool',
      },
    ],
    name: 'setYieldState',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      {
        internalType: 'contract IERC20',
        name: 'asset',
        type: 'address',
      },
    ],
    name: 'totalBalance',
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
    name: 'treasury',
    outputs: [
      {
        internalType: 'contract ITreasury',
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
        internalType: 'contract IYield',
        name: 'yieldSrc',
        type: 'address',
      },
    ],
    name: 'twaa',
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
        internalType: 'contract IERC20',
        name: 'asset',
        type: 'address',
      },
      {
        internalType: 'uint256',
        name: 'user',
        type: 'uint256',
      },
      {
        internalType: 'uint256',
        name: 'amount',
        type: 'uint256',
      },
    ],
    name: 'withdraw',
    outputs: [
      {
        internalType: 'uint256',
        name: '',
        type: 'uint256',
      },
    ],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      {
        internalType: 'contract IERC20',
        name: 'asset',
        type: 'address',
      },
    ],
    name: 'yields',
    outputs: [
      {
        components: [
          {
            internalType: 'contract IYield',
            name: 'yieldSrc',
            type: 'address',
          },
          {
            internalType: 'uint256',
            name: 'start',
            type: 'uint256',
          },
          {
            internalType: 'uint256',
            name: 'apr',
            type: 'uint256',
          },
          {
            internalType: 'uint256',
            name: 'lastUpdate',
            type: 'uint256',
          },
          {
            internalType: 'uint256',
            name: 'lastDeposit',
            type: 'uint256',
          },
          {
            internalType: 'bool',
            name: 'state',
            type: 'bool',
          },
        ],
        internalType: 'struct Yield[]',
        name: '',
        type: 'tuple[]',
      },
    ],
    stateMutability: 'view',
    type: 'function',
  },
];
