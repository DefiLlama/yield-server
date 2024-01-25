module.exports = [
  {
    inputs: [
      { internalType: 'uint256', name: 'offset', type: 'uint256' },
      { internalType: 'uint256', name: 'limit', type: 'uint256' },
    ],
    name: 'getMinipoolCountPerStatus',
    outputs: [
      { internalType: 'uint256', name: 'initialisedCount', type: 'uint256' },
      { internalType: 'uint256', name: 'prelaunchCount', type: 'uint256' },
      { internalType: 'uint256', name: 'stakingCount', type: 'uint256' },
      { internalType: 'uint256', name: 'withdrawableCount', type: 'uint256' },
      { internalType: 'uint256', name: 'dissolvedCount', type: 'uint256' },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      { internalType: 'string', name: '_networkContractName', type: 'string' },
    ],
    name: 'balanceOf',
    outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
];
