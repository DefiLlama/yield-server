module.exports = {
  dustRewardsControllerAbi: [
    {
      inputs: [{ internalType: 'address', name: 'asset', type: 'address' }],
      name: 'getRewardsByAsset',
      outputs: [{ internalType: 'address[]', name: '', type: 'address[]' }],
      stateMutability: 'view',
      type: 'function',
    },
    {
      inputs: [
        { internalType: 'address', name: 'asset', type: 'address' },
        { internalType: 'address', name: 'reward', type: 'address' },
      ],
      name: 'getRewardsData',
      outputs: [
        { internalType: 'uint256', name: '', type: 'uint256' },
        { internalType: 'uint256', name: '', type: 'uint256' },
        { internalType: 'uint256', name: '', type: 'uint256' },
        { internalType: 'uint256', name: '', type: 'uint256' },
      ],
      stateMutability: 'view',
      type: 'function',
    },
  ],
};
