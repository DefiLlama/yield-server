const ARB_MASTER_CHEF_ABI = [
  {
    type: 'constructor',
    inputs: [
      { name: '_arb', type: 'address', internalType: 'contract ERC20' },
      {
        name: '_arbVault',
        type: 'address',
        internalType: 'contract ArbVaultGmx',
      },
      { name: '_auth', type: 'address', internalType: 'contract Auth' },
      { name: '_arbPerSec', type: 'uint256', internalType: 'uint256' },
      { name: '_startTimestamp', type: 'uint256', internalType: 'uint256' },
    ],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'ARB',
    inputs: [],
    outputs: [{ name: '', type: 'address', internalType: 'contract ERC20' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'AUTH',
    inputs: [],
    outputs: [{ name: '', type: 'address', internalType: 'contract Auth' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'add',
    inputs: [
      { name: '_allocPoint', type: 'uint256', internalType: 'uint256' },
      { name: '_lpToken', type: 'address', internalType: 'contract ERC20' },
      {
        name: '_rewarder',
        type: 'address',
        internalType: 'contract IRewarder',
      },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'arbPerSec',
    inputs: [],
    outputs: [{ name: '', type: 'uint256', internalType: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'arbVault',
    inputs: [],
    outputs: [
      { name: '', type: 'address', internalType: 'contract ArbVaultGmx' },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'collectAllPoolRewards',
    inputs: [],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'deposit',
    inputs: [
      { name: '_pid', type: 'uint256', internalType: 'uint256' },
      { name: '_amount', type: 'uint256', internalType: 'uint256' },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'emergencyWithdraw',
    inputs: [{ name: '_pid', type: 'uint256', internalType: 'uint256' }],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'getPIdFromLP',
    inputs: [{ name: 'lp', type: 'address', internalType: 'address' }],
    outputs: [{ name: '', type: 'uint256', internalType: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'massUpdatePools',
    inputs: [],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'pendingTokens',
    inputs: [
      { name: '_pid', type: 'uint256', internalType: 'uint256' },
      { name: '_user', type: 'address', internalType: 'address' },
    ],
    outputs: [
      { name: 'pendingOArb', type: 'uint256', internalType: 'uint256' },
      { name: 'bonusTokenAddress', type: 'address', internalType: 'address' },
      { name: 'bonusTokenSymbol', type: 'string', internalType: 'string' },
      { name: 'pendingBonusToken', type: 'uint256', internalType: 'uint256' },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'poolInfo',
    inputs: [{ name: '', type: 'uint256', internalType: 'uint256' }],
    outputs: [
      { name: 'lpToken', type: 'address', internalType: 'contract ERC20' },
      { name: 'allocPoint', type: 'uint256', internalType: 'uint256' },
      { name: 'lastRewardTimestamp', type: 'uint256', internalType: 'uint256' },
      { name: 'accOArbPerShare', type: 'uint256', internalType: 'uint256' },
      { name: 'rewarder', type: 'address', internalType: 'contract IRewarder' },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'poolLength',
    inputs: [],
    outputs: [{ name: '', type: 'uint256', internalType: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'rewarderBonusTokenInfo',
    inputs: [{ name: '_pid', type: 'uint256', internalType: 'uint256' }],
    outputs: [
      { name: 'bonusTokenAddress', type: 'address', internalType: 'address' },
      { name: 'bonusTokenSymbol', type: 'string', internalType: 'string' },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'set',
    inputs: [
      { name: '_pid', type: 'uint256', internalType: 'uint256' },
      { name: '_allocPoint', type: 'uint256', internalType: 'uint256' },
      {
        name: '_rewarder',
        type: 'address',
        internalType: 'contract IRewarder',
      },
      { name: 'overwrite', type: 'bool', internalType: 'bool' },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'startTimestamp',
    inputs: [],
    outputs: [{ name: '', type: 'uint256', internalType: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'totalAllocPoint',
    inputs: [],
    outputs: [{ name: '', type: 'uint256', internalType: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'updateEmissionRate',
    inputs: [{ name: '_arbPerSec', type: 'uint256', internalType: 'uint256' }],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'updatePool',
    inputs: [{ name: '_pid', type: 'uint256', internalType: 'uint256' }],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'userInfo',
    inputs: [
      { name: '', type: 'uint256', internalType: 'uint256' },
      { name: '', type: 'address', internalType: 'address' },
    ],
    outputs: [
      { name: 'amount', type: 'uint256', internalType: 'uint256' },
      { name: 'rewardDebt', type: 'uint256', internalType: 'uint256' },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'withdraw',
    inputs: [
      { name: '_pid', type: 'uint256', internalType: 'uint256' },
      { name: '_amount', type: 'uint256', internalType: 'uint256' },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'event',
    name: 'Add',
    inputs: [
      { name: 'pid', type: 'uint256', indexed: true, internalType: 'uint256' },
      {
        name: 'allocPoint',
        type: 'uint256',
        indexed: false,
        internalType: 'uint256',
      },
      {
        name: 'lpToken',
        type: 'address',
        indexed: true,
        internalType: 'contract ERC20',
      },
      {
        name: 'rewarder',
        type: 'address',
        indexed: true,
        internalType: 'contract IRewarder',
      },
    ],
    anonymous: false,
  },
  {
    type: 'event',
    name: 'Deposit',
    inputs: [
      { name: 'user', type: 'address', indexed: true, internalType: 'address' },
      { name: 'pid', type: 'uint256', indexed: true, internalType: 'uint256' },
      {
        name: 'amount',
        type: 'uint256',
        indexed: false,
        internalType: 'uint256',
      },
    ],
    anonymous: false,
  },
  {
    type: 'event',
    name: 'EmergencyWithdraw',
    inputs: [
      { name: 'user', type: 'address', indexed: true, internalType: 'address' },
      { name: 'pid', type: 'uint256', indexed: true, internalType: 'uint256' },
      {
        name: 'amount',
        type: 'uint256',
        indexed: false,
        internalType: 'uint256',
      },
    ],
    anonymous: false,
  },
  {
    type: 'event',
    name: 'Harvest',
    inputs: [
      { name: 'user', type: 'address', indexed: true, internalType: 'address' },
      { name: 'pid', type: 'uint256', indexed: true, internalType: 'uint256' },
      {
        name: 'amount',
        type: 'uint256',
        indexed: false,
        internalType: 'uint256',
      },
    ],
    anonymous: false,
  },
  {
    type: 'event',
    name: 'Set',
    inputs: [
      { name: 'pid', type: 'uint256', indexed: true, internalType: 'uint256' },
      {
        name: 'allocPoint',
        type: 'uint256',
        indexed: false,
        internalType: 'uint256',
      },
      {
        name: 'rewarder',
        type: 'address',
        indexed: true,
        internalType: 'contract IRewarder',
      },
      { name: 'overwrite', type: 'bool', indexed: false, internalType: 'bool' },
    ],
    anonymous: false,
  },
  {
    type: 'event',
    name: 'UpdateEmissionRate',
    inputs: [
      { name: 'user', type: 'address', indexed: true, internalType: 'address' },
      {
        name: '_arbPerSec',
        type: 'uint256',
        indexed: false,
        internalType: 'uint256',
      },
    ],
    anonymous: false,
  },
  {
    type: 'event',
    name: 'UpdatePool',
    inputs: [
      { name: 'pid', type: 'uint256', indexed: true, internalType: 'uint256' },
      {
        name: 'lastRewardTimestamp',
        type: 'uint256',
        indexed: false,
        internalType: 'uint256',
      },
      {
        name: 'lpSupply',
        type: 'uint256',
        indexed: false,
        internalType: 'uint256',
      },
      {
        name: 'accOArbPerShare',
        type: 'uint256',
        indexed: false,
        internalType: 'uint256',
      },
    ],
    anonymous: false,
  },
  {
    type: 'event',
    name: 'Withdraw',
    inputs: [
      { name: 'user', type: 'address', indexed: true, internalType: 'address' },
      { name: 'pid', type: 'uint256', indexed: true, internalType: 'uint256' },
      {
        name: 'amount',
        type: 'uint256',
        indexed: false,
        internalType: 'uint256',
      },
    ],
    anonymous: false,
  },
];

module.exports = {
  ARB_MASTER_CHEF_ABI,
};
