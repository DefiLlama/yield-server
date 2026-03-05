module.exports = {
  farmingRangeABI: [
    {
      inputs: [
        { internalType: 'address', name: '_rewardManager', type: 'address' },
      ],
      stateMutability: 'nonpayable',
      type: 'constructor',
    },
    {
      anonymous: false,
      inputs: [
        {
          indexed: true,
          internalType: 'uint256',
          name: 'campaignID',
          type: 'uint256',
        },
        {
          indexed: false,
          internalType: 'contract IERC20',
          name: 'stakingToken',
          type: 'address',
        },
        {
          indexed: false,
          internalType: 'contract IERC20',
          name: 'rewardToken',
          type: 'address',
        },
        {
          indexed: false,
          internalType: 'uint256',
          name: 'startBlock',
          type: 'uint256',
        },
      ],
      name: 'AddCampaignInfo',
      type: 'event',
    },
    {
      anonymous: false,
      inputs: [
        {
          indexed: true,
          internalType: 'uint256',
          name: 'campaignID',
          type: 'uint256',
        },
        {
          indexed: true,
          internalType: 'uint256',
          name: 'phase',
          type: 'uint256',
        },
        {
          indexed: false,
          internalType: 'uint256',
          name: 'endBlock',
          type: 'uint256',
        },
        {
          indexed: false,
          internalType: 'uint256',
          name: 'rewardPerBlock',
          type: 'uint256',
        },
      ],
      name: 'AddRewardInfo',
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
          indexed: false,
          internalType: 'uint256',
          name: 'amount',
          type: 'uint256',
        },
        {
          indexed: false,
          internalType: 'uint256',
          name: 'campaign',
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
          indexed: true,
          internalType: 'address',
          name: 'user',
          type: 'address',
        },
        {
          indexed: false,
          internalType: 'uint256',
          name: 'amount',
          type: 'uint256',
        },
        {
          indexed: false,
          internalType: 'uint256',
          name: 'campaign',
          type: 'uint256',
        },
      ],
      name: 'EmergencyWithdraw',
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
          internalType: 'uint256',
          name: 'campaignID',
          type: 'uint256',
        },
        {
          indexed: true,
          internalType: 'uint256',
          name: 'phase',
          type: 'uint256',
        },
      ],
      name: 'RemoveRewardInfo',
      type: 'event',
    },
    {
      anonymous: false,
      inputs: [
        {
          indexed: false,
          internalType: 'uint256',
          name: 'rewardInfoLimit',
          type: 'uint256',
        },
      ],
      name: 'SetRewardInfoLimit',
      type: 'event',
    },
    {
      anonymous: false,
      inputs: [
        {
          indexed: true,
          internalType: 'uint256',
          name: 'campaignID',
          type: 'uint256',
        },
        {
          indexed: true,
          internalType: 'uint256',
          name: 'phase',
          type: 'uint256',
        },
        {
          indexed: false,
          internalType: 'uint256',
          name: 'endBlock',
          type: 'uint256',
        },
        {
          indexed: false,
          internalType: 'uint256',
          name: 'rewardPerBlock',
          type: 'uint256',
        },
      ],
      name: 'UpdateRewardInfo',
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
          indexed: false,
          internalType: 'uint256',
          name: 'amount',
          type: 'uint256',
        },
        {
          indexed: false,
          internalType: 'uint256',
          name: 'campaign',
          type: 'uint256',
        },
      ],
      name: 'Withdraw',
      type: 'event',
    },
    {
      inputs: [
        {
          internalType: 'contract IERC20',
          name: '_stakingToken',
          type: 'address',
        },
        {
          internalType: 'contract IERC20',
          name: '_rewardToken',
          type: 'address',
        },
        { internalType: 'uint256', name: '_startBlock', type: 'uint256' },
      ],
      name: 'addCampaignInfo',
      outputs: [],
      stateMutability: 'nonpayable',
      type: 'function',
    },
    {
      inputs: [
        { internalType: 'uint256', name: '_campaignID', type: 'uint256' },
        { internalType: 'uint256', name: '_endBlock', type: 'uint256' },
        { internalType: 'uint256', name: '_rewardPerBlock', type: 'uint256' },
      ],
      name: 'addRewardInfo',
      outputs: [],
      stateMutability: 'nonpayable',
      type: 'function',
    },
    {
      inputs: [
        { internalType: 'uint256', name: '_campaignID', type: 'uint256' },
        { internalType: 'uint256[]', name: '_endBlock', type: 'uint256[]' },
        {
          internalType: 'uint256[]',
          name: '_rewardPerBlock',
          type: 'uint256[]',
        },
      ],
      name: 'addRewardInfoMultiple',
      outputs: [],
      stateMutability: 'nonpayable',
      type: 'function',
    },
    {
      inputs: [],
      name: 'arbitrumBlockNumber',
      outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
      stateMutability: 'view',
      type: 'function',
    },
    {
      inputs: [
        { internalType: 'contract IERC20', name: '_token', type: 'address' },
        { internalType: 'address', name: '_from', type: 'address' },
        { internalType: 'address', name: '_to', type: 'address' },
        { internalType: 'uint256', name: '_amount', type: 'uint256' },
      ],
      name: 'attemptTransfer',
      outputs: [],
      stateMutability: 'nonpayable',
      type: 'function',
    },
    {
      inputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
      name: 'campaignInfo',
      outputs: [
        {
          internalType: 'contract IERC20',
          name: 'stakingToken',
          type: 'address',
        },
        {
          internalType: 'contract IERC20',
          name: 'rewardToken',
          type: 'address',
        },
        { internalType: 'uint256', name: 'startBlock', type: 'uint256' },
        { internalType: 'uint256', name: 'lastRewardBlock', type: 'uint256' },
        { internalType: 'uint256', name: 'accRewardPerShare', type: 'uint256' },
        { internalType: 'uint256', name: 'totalStaked', type: 'uint256' },
        { internalType: 'uint256', name: 'totalRewards', type: 'uint256' },
      ],
      stateMutability: 'view',
      type: 'function',
    },
    {
      inputs: [],
      name: 'campaignInfoLen',
      outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
      stateMutability: 'view',
      type: 'function',
    },
    {
      inputs: [
        { internalType: 'uint256', name: '', type: 'uint256' },
        { internalType: 'uint256', name: '', type: 'uint256' },
      ],
      name: 'campaignRewardInfo',
      outputs: [
        { internalType: 'uint256', name: 'endBlock', type: 'uint256' },
        { internalType: 'uint256', name: 'rewardPerBlock', type: 'uint256' },
      ],
      stateMutability: 'view',
      type: 'function',
    },
    {
      inputs: [
        { internalType: 'uint256', name: '_campaignID', type: 'uint256' },
      ],
      name: 'currentEndBlock',
      outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
      stateMutability: 'view',
      type: 'function',
    },
    {
      inputs: [
        { internalType: 'uint256', name: '_campaignID', type: 'uint256' },
      ],
      name: 'currentRewardPerBlock',
      outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
      stateMutability: 'view',
      type: 'function',
    },
    {
      inputs: [
        { internalType: 'uint256', name: '_campaignID', type: 'uint256' },
        { internalType: 'uint256', name: '_amount', type: 'uint256' },
      ],
      name: 'deposit',
      outputs: [],
      stateMutability: 'nonpayable',
      type: 'function',
    },
    {
      inputs: [
        { internalType: 'uint256', name: '_campaignID', type: 'uint256' },
        { internalType: 'uint256', name: '_amount', type: 'uint256' },
        { internalType: 'bool', name: '_approveMax', type: 'bool' },
        { internalType: 'uint256', name: '_deadline', type: 'uint256' },
        { internalType: 'uint8', name: '_v', type: 'uint8' },
        { internalType: 'bytes32', name: '_r', type: 'bytes32' },
        { internalType: 'bytes32', name: '_s', type: 'bytes32' },
      ],
      name: 'depositWithPermit',
      outputs: [],
      stateMutability: 'nonpayable',
      type: 'function',
    },
    {
      inputs: [
        { internalType: 'uint256', name: '_campaignID', type: 'uint256' },
      ],
      name: 'emergencyWithdraw',
      outputs: [],
      stateMutability: 'nonpayable',
      type: 'function',
    },
    {
      inputs: [
        { internalType: 'uint256', name: '_from', type: 'uint256' },
        { internalType: 'uint256', name: '_to', type: 'uint256' },
        { internalType: 'uint256', name: '_endBlock', type: 'uint256' },
      ],
      name: 'getMultiplier',
      outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
      stateMutability: 'pure',
      type: 'function',
    },
    {
      inputs: [
        { internalType: 'uint256[]', name: '_campaignIDs', type: 'uint256[]' },
      ],
      name: 'harvest',
      outputs: [],
      stateMutability: 'nonpayable',
      type: 'function',
    },
    {
      inputs: [],
      name: 'massUpdateCampaigns',
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
      inputs: [
        { internalType: 'uint256', name: '_campaignID', type: 'uint256' },
        { internalType: 'address', name: '_user', type: 'address' },
      ],
      name: 'pendingReward',
      outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
      stateMutability: 'view',
      type: 'function',
    },
    {
      inputs: [
        { internalType: 'uint256', name: '_campaignID', type: 'uint256' },
      ],
      name: 'removeLastRewardInfo',
      outputs: [],
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
        { internalType: 'uint256', name: '_campaignID', type: 'uint256' },
      ],
      name: 'rewardInfoLen',
      outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
      stateMutability: 'view',
      type: 'function',
    },
    {
      inputs: [],
      name: 'rewardInfoLimit',
      outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
      stateMutability: 'view',
      type: 'function',
    },
    {
      inputs: [],
      name: 'rewardManager',
      outputs: [{ internalType: 'address', name: '', type: 'address' }],
      stateMutability: 'view',
      type: 'function',
    },
    {
      inputs: [
        {
          internalType: 'uint256',
          name: '_updatedRewardInfoLimit',
          type: 'uint256',
        },
      ],
      name: 'setRewardInfoLimit',
      outputs: [],
      stateMutability: 'nonpayable',
      type: 'function',
    },
    {
      inputs: [{ internalType: 'address', name: 'newOwner', type: 'address' }],
      name: 'transferOwnership',
      outputs: [],
      stateMutability: 'nonpayable',
      type: 'function',
    },
    {
      inputs: [
        { internalType: 'uint256', name: '_campaignID', type: 'uint256' },
      ],
      name: 'updateCampaign',
      outputs: [],
      stateMutability: 'nonpayable',
      type: 'function',
    },
    {
      inputs: [
        { internalType: 'uint256[]', name: '_campaignID', type: 'uint256[]' },
        {
          internalType: 'uint256[][]',
          name: '_rewardIndex',
          type: 'uint256[][]',
        },
        { internalType: 'uint256[][]', name: '_endBlock', type: 'uint256[][]' },
        {
          internalType: 'uint256[][]',
          name: '_rewardPerBlock',
          type: 'uint256[][]',
        },
      ],
      name: 'updateCampaignsRewards',
      outputs: [],
      stateMutability: 'nonpayable',
      type: 'function',
    },
    {
      inputs: [
        { internalType: 'uint256', name: '_campaignID', type: 'uint256' },
        { internalType: 'uint256', name: '_rewardIndex', type: 'uint256' },
        { internalType: 'uint256', name: '_endBlock', type: 'uint256' },
        { internalType: 'uint256', name: '_rewardPerBlock', type: 'uint256' },
      ],
      name: 'updateRewardInfo',
      outputs: [],
      stateMutability: 'nonpayable',
      type: 'function',
    },
    {
      inputs: [
        { internalType: 'uint256', name: '_campaignID', type: 'uint256' },
        { internalType: 'uint256[]', name: '_rewardIndex', type: 'uint256[]' },
        { internalType: 'uint256[]', name: '_endBlock', type: 'uint256[]' },
        {
          internalType: 'uint256[]',
          name: '_rewardPerBlock',
          type: 'uint256[]',
        },
      ],
      name: 'updateRewardMultiple',
      outputs: [],
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
      ],
      stateMutability: 'view',
      type: 'function',
    },
    {
      inputs: [
        { internalType: 'uint256', name: '_campaignID', type: 'uint256' },
        { internalType: 'uint256', name: '_amount', type: 'uint256' },
      ],
      name: 'withdraw',
      outputs: [],
      stateMutability: 'nonpayable',
      type: 'function',
    },
  ],
};
