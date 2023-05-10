module.exports = {
  farmingRangeABI: [
    {
      inputs: [
        {
          internalType: 'uint256',
          name: '',
          type: 'uint256',
        },
      ],
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
        {
          internalType: 'uint256',
          name: 'startBlock',
          type: 'uint256',
        },
        {
          internalType: 'uint256',
          name: 'lastRewardBlock',
          type: 'uint256',
        },
        {
          internalType: 'uint256',
          name: 'accRewardPerShare',
          type: 'uint256',
        },
        {
          internalType: 'uint256',
          name: 'totalStaked',
          type: 'uint256',
        },
        {
          internalType: 'uint256',
          name: 'totalRewards',
          type: 'uint256',
        },
      ],
      stateMutability: 'view',
      type: 'function',
    },
    {
      inputs: [],
      name: 'campaignInfoLen',
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
          name: '',
          type: 'uint256',
        },
        {
          internalType: 'uint256',
          name: '',
          type: 'uint256',
        },
      ],
      name: 'campaignRewardInfo',
      outputs: [
        {
          internalType: 'uint256',
          name: 'endBlock',
          type: 'uint256',
        },
        {
          internalType: 'uint256',
          name: 'rewardPerBlock',
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
          name: '_campaignID',
          type: 'uint256',
        },
      ],
      name: 'rewardInfoLen',
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
  ],
};
