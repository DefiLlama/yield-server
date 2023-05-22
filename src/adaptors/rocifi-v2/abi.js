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
    getPoolToScoreLtvs: {
      inputs: [
        {
          internalType: 'contract IPool',
          name: 'pool',
          type: 'address',
        },
        {
          internalType: 'uint16',
          name: 'score',
          type: 'uint16',
        },
      ],
      name: 'getPoolToScoreLtvs',
      outputs: [
        {
          internalType: 'uint256[]',
          name: '',
          type: 'uint256[]',
        },
      ],
      stateMutability: 'view',
      type: 'function',
    },
    getInterestSettings: {
      inputs: [
        {
          internalType: 'contract IPool',
          name: 'pool',
          type: 'address',
        },
        {
          internalType: 'uint16',
          name: 'score',
          type: 'uint16',
        },
        {
          internalType: 'uint256',
          name: 'ltv',
          type: 'uint256',
        },
        {
          internalType: 'uint256',
          name: 'duration',
          type: 'uint256',
        },
      ],
      name: 'getInterestSettings',
      outputs: [
        {
          components: [
            {
              internalType: 'uint256',
              name: 'interest',
              type: 'uint256',
            },
            {
              internalType: 'uint256',
              name: 'limit',
              type: 'uint256',
            },
          ],
          internalType: 'struct ISettingsProvider.InterestSettings',
          name: '',
          type: 'tuple',
        },
      ],
      stateMutability: 'view',
      type: 'function',
    },
  },
};
