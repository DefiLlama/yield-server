module.exports = {
  pool: {
    symbol: {
      inputs: [],
      name: 'symbol',
      outputs: [{ internalType: 'string', name: '', type: 'string' }],
      stateMutability: 'view',
      type: 'function',
    },
    underlyingToken: {
      inputs: [],
      name: 'underlyingToken',
      outputs: [
        {
          internalType: 'contract IERC20MetadataUpgradeable',
          name: '',
          type: 'address',
        },
      ],
      stateMutability: 'view',
      type: 'function',
    },
  },
  limitManager: {
    poolToBorrowedAmount: {
      inputs: [{ internalType: 'contract IPool', name: '', type: 'address' }],
      name: 'poolToBorrowedAmount',
      outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
      stateMutability: 'view',
      type: 'function',
    },
  },
  settingsProvider: {
    getPools: {
      inputs: [],
      name: 'getPools',
      outputs: [
        {
          internalType: 'contract IPool[]',
          name: '',
          type: 'address[]',
        },
      ],
      stateMutability: 'view',
      type: 'function',
    },
  },
};
