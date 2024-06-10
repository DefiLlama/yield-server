module.exports = [
  {
    inputs: [
      { internalType: 'uint256', name: 'duration_', type: 'uint256' },
      { internalType: 'uint256', name: 'startTvl_', type: 'uint256' },
      { internalType: 'uint256', name: 'rewardAmount_', type: 'uint256' },
      { internalType: 'address', name: 'initiator_', type: 'address' },
    ],
    stateMutability: 'nonpayable',
    type: 'constructor',
  },
  {
    inputs: [{ internalType: 'uint256', name: 'errorId_', type: 'uint256' }],
    name: 'FluidLendingError',
    type: 'error',
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: false,
        internalType: 'uint256',
        name: 'startTime',
        type: 'uint256',
      },
      {
        indexed: false,
        internalType: 'uint256',
        name: 'endTime',
        type: 'uint256',
      },
    ],
    name: 'LogRewardsStarted',
    type: 'event',
  },
  {
    inputs: [],
    name: 'getConfig',
    outputs: [
      { internalType: 'uint256', name: 'duration_', type: 'uint256' },
      { internalType: 'uint256', name: 'startTime_', type: 'uint256' },
      { internalType: 'uint256', name: 'endTime_', type: 'uint256' },
      { internalType: 'uint256', name: 'startTvl_', type: 'uint256' },
      { internalType: 'uint256', name: 'maxRate_', type: 'uint256' },
      { internalType: 'uint256', name: 'rewardAmount_', type: 'uint256' },
      { internalType: 'address', name: 'initiator_', type: 'address' },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      { internalType: 'uint256', name: 'totalAssets_', type: 'uint256' },
    ],
    name: 'getRate',
    outputs: [
      { internalType: 'uint256', name: 'rate_', type: 'uint256' },
      { internalType: 'bool', name: 'ended_', type: 'bool' },
      { internalType: 'uint256', name: 'startTime_', type: 'uint256' },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'start',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
];
