module.exports = {
  rewarderABI: [
    {
      inputs: [
        { internalType: 'address', name: '_MASTERCHEF_V2', type: 'address' },
      ],
      stateMutability: 'nonpayable',
      type: 'constructor',
    },
    {
      anonymous: false,
      inputs: [
        {
          indexed: true,
          internalType: 'contract IERC20',
          name: 'rewardToken',
          type: 'address',
        },
        {
          indexed: false,
          internalType: 'address',
          name: 'owner',
          type: 'address',
        },
        {
          indexed: false,
          internalType: 'uint256',
          name: 'rewardPerSecond',
          type: 'uint256',
        },
        {
          indexed: true,
          internalType: 'contract IERC20',
          name: 'masterLpToken',
          type: 'address',
        },
      ],
      name: 'LogInit',
      type: 'event',
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
          internalType: 'uint256',
          name: 'pid',
          type: 'uint256',
        },
        {
          indexed: false,
          internalType: 'uint256',
          name: 'amount',
          type: 'uint256',
        },
        { indexed: true, internalType: 'address', name: 'to', type: 'address' },
      ],
      name: 'LogOnReward',
      type: 'event',
    },
    {
      anonymous: false,
      inputs: [
        {
          indexed: false,
          internalType: 'uint256',
          name: 'rewardPerSecond',
          type: 'uint256',
        },
      ],
      name: 'LogRewardPerSecond',
      type: 'event',
    },
    {
      anonymous: false,
      inputs: [
        {
          indexed: true,
          internalType: 'uint256',
          name: 'pid',
          type: 'uint256',
        },
        {
          indexed: false,
          internalType: 'uint64',
          name: 'lastRewardTime',
          type: 'uint64',
        },
        {
          indexed: false,
          internalType: 'uint256',
          name: 'lpSupply',
          type: 'uint256',
        },
        {
          indexed: false,
          internalType: 'uint256',
          name: 'accToken1PerShare',
          type: 'uint256',
        },
      ],
      name: 'LogUpdatePool',
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
      inputs: [],
      name: 'MASTERCHEF_V2',
      outputs: [{ internalType: 'address', name: '', type: 'address' }],
      stateMutability: 'view',
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
      inputs: [{ internalType: 'bytes', name: 'data', type: 'bytes' }],
      name: 'init',
      outputs: [],
      stateMutability: 'payable',
      type: 'function',
    },
    {
      inputs: [],
      name: 'masterLpToken',
      outputs: [{ internalType: 'contract IERC20', name: '', type: 'address' }],
      stateMutability: 'view',
      type: 'function',
    },
    {
      inputs: [
        { internalType: 'uint256', name: 'pid', type: 'uint256' },
        { internalType: 'address', name: '_user', type: 'address' },
        { internalType: 'address', name: 'to', type: 'address' },
        { internalType: 'uint256', name: '', type: 'uint256' },
        { internalType: 'uint256', name: 'lpTokenAmount', type: 'uint256' },
      ],
      name: 'onSushiReward',
      outputs: [],
      stateMutability: 'nonpayable',
      type: 'function',
    },
    {
      inputs: [],
      name: 'owner',
      outputs: [{ internalType: 'address', name: '', type: 'address' }],
      stateMutability: 'view',
      type: 'function',
    },
    {
      inputs: [],
      name: 'pendingOwner',
      outputs: [{ internalType: 'address', name: '', type: 'address' }],
      stateMutability: 'view',
      type: 'function',
    },
    {
      inputs: [
        { internalType: 'uint256', name: '_pid', type: 'uint256' },
        { internalType: 'address', name: '_user', type: 'address' },
      ],
      name: 'pendingToken',
      outputs: [{ internalType: 'uint256', name: 'pending', type: 'uint256' }],
      stateMutability: 'view',
      type: 'function',
    },
    {
      inputs: [
        { internalType: 'uint256', name: 'pid', type: 'uint256' },
        { internalType: 'address', name: 'user', type: 'address' },
        { internalType: 'uint256', name: '', type: 'uint256' },
      ],
      name: 'pendingTokens',
      outputs: [
        {
          internalType: 'contract IERC20[]',
          name: 'rewardTokens',
          type: 'address[]',
        },
        { internalType: 'uint256[]', name: 'rewardAmounts', type: 'uint256[]' },
      ],
      stateMutability: 'view',
      type: 'function',
    },
    {
      inputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
      name: 'poolInfo',
      outputs: [
        { internalType: 'uint128', name: 'accToken1PerShare', type: 'uint128' },
        { internalType: 'uint64', name: 'lastRewardTime', type: 'uint64' },
      ],
      stateMutability: 'view',
      type: 'function',
    },
    {
      inputs: [
        { internalType: 'address', name: 'token', type: 'address' },
        { internalType: 'uint256', name: 'amount', type: 'uint256' },
        { internalType: 'address payable', name: 'to', type: 'address' },
      ],
      name: 'reclaimTokens',
      outputs: [],
      stateMutability: 'nonpayable',
      type: 'function',
    },
    {
      inputs: [],
      name: 'rewardPerSecond',
      outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
      stateMutability: 'view',
      type: 'function',
    },
    {
      inputs: [],
      name: 'rewardRates',
      outputs: [{ internalType: 'uint256[]', name: '', type: 'uint256[]' }],
      stateMutability: 'view',
      type: 'function',
    },
    {
      inputs: [],
      name: 'rewardToken',
      outputs: [{ internalType: 'contract IERC20', name: '', type: 'address' }],
      stateMutability: 'view',
      type: 'function',
    },
    {
      inputs: [
        { internalType: 'uint256', name: '_rewardPerSecond', type: 'uint256' },
      ],
      name: 'setRewardPerSecond',
      outputs: [],
      stateMutability: 'nonpayable',
      type: 'function',
    },
    {
      inputs: [
        { internalType: 'address', name: 'newOwner', type: 'address' },
        { internalType: 'bool', name: 'direct', type: 'bool' },
        { internalType: 'bool', name: 'renounce', type: 'bool' },
      ],
      name: 'transferOwnership',
      outputs: [],
      stateMutability: 'nonpayable',
      type: 'function',
    },
    {
      inputs: [{ internalType: 'uint256', name: 'pid', type: 'uint256' }],
      name: 'updatePool',
      outputs: [
        {
          components: [
            {
              internalType: 'uint128',
              name: 'accToken1PerShare',
              type: 'uint128',
            },
            { internalType: 'uint64', name: 'lastRewardTime', type: 'uint64' },
          ],
          internalType: 'struct TreasureRewarder.PoolInfo',
          name: 'pool',
          type: 'tuple',
        },
      ],
      stateMutability: 'nonpayable',
      type: 'function',
    },
    {
      inputs: [
        { internalType: 'uint256', name: '', type: 'uint256' },
        { internalType: 'address', name: '', type: 'address' },
      ],
      name: 'userInfo',
      outputs: [
        { internalType: 'uint256', name: 'amount', type: 'uint256' },
        { internalType: 'uint256', name: 'rewardDebt', type: 'uint256' },
        { internalType: 'uint256', name: 'unpaidRewards', type: 'uint256' },
      ],
      stateMutability: 'view',
      type: 'function',
    },
  ],
};
