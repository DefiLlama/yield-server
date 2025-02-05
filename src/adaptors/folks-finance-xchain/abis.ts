const HubPoolAbi = {
  getDepositData: {
    inputs: [],
    name: 'getDepositData',
    outputs: [
      {
        components: [
          {
            internalType: 'uint16',
            name: 'optimalUtilisationRatio',
            type: 'uint16',
          },
          {
            internalType: 'uint256',
            name: 'totalAmount',
            type: 'uint256',
          },
          {
            internalType: 'uint256',
            name: 'interestRate',
            type: 'uint256',
          },
          {
            internalType: 'uint256',
            name: 'interestIndex',
            type: 'uint256',
          },
        ],
        internalType: 'struct HubPoolState.DepositData',
        name: '',
        type: 'tuple',
      },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  getVariableBorrowData: {
    inputs: [],
    name: 'getVariableBorrowData',
    outputs: [
      {
        components: [
          {
            internalType: 'uint32',
            name: 'vr0',
            type: 'uint32',
          },
          {
            internalType: 'uint32',
            name: 'vr1',
            type: 'uint32',
          },
          {
            internalType: 'uint32',
            name: 'vr2',
            type: 'uint32',
          },
          {
            internalType: 'uint256',
            name: 'totalAmount',
            type: 'uint256',
          },
          {
            internalType: 'uint256',
            name: 'interestRate',
            type: 'uint256',
          },
          {
            internalType: 'uint256',
            name: 'interestIndex',
            type: 'uint256',
          },
        ],
        internalType: 'struct HubPoolState.VariableBorrowData',
        name: '',
        type: 'tuple',
      },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  getStableBorrowData: {
    inputs: [],
    name: 'getStableBorrowData',
    outputs: [
      {
        components: [
          {
            internalType: 'uint32',
            name: 'sr0',
            type: 'uint32',
          },
          {
            internalType: 'uint32',
            name: 'sr1',
            type: 'uint32',
          },
          {
            internalType: 'uint32',
            name: 'sr2',
            type: 'uint32',
          },
          {
            internalType: 'uint32',
            name: 'sr3',
            type: 'uint32',
          },
          {
            internalType: 'uint16',
            name: 'optimalStableToTotalDebtRatio',
            type: 'uint16',
          },
          {
            internalType: 'uint16',
            name: 'rebalanceUpUtilisationRatio',
            type: 'uint16',
          },
          {
            internalType: 'uint16',
            name: 'rebalanceUpDepositInterestRate',
            type: 'uint16',
          },
          {
            internalType: 'uint16',
            name: 'rebalanceDownDelta',
            type: 'uint16',
          },
          {
            internalType: 'uint256',
            name: 'totalAmount',
            type: 'uint256',
          },
          {
            internalType: 'uint256',
            name: 'interestRate',
            type: 'uint256',
          },
          {
            internalType: 'uint256',
            name: 'averageInterestRate',
            type: 'uint256',
          },
        ],
        internalType: 'struct HubPoolState.StableBorrowData',
        name: '',
        type: 'tuple',
      },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  getPoolId: {
    inputs: [],
    name: 'getPoolId',
    outputs: [
      {
        internalType: 'uint8',
        name: '',
        type: 'uint8',
      },
    ],
    stateMutability: 'view',
    type: 'function',
  },
};

const RewardsV1Abi = {
  getActiveEpoch: {
    inputs: [
      {
        internalType: 'uint8',
        name: 'poolId',
        type: 'uint8',
      },
    ],
    name: 'getActiveEpoch',
    outputs: [
      {
        internalType: 'uint16',
        name: 'epochIndex',
        type: 'uint16',
      },
      {
        components: [
          {
            internalType: 'uint256',
            name: 'start',
            type: 'uint256',
          },
          {
            internalType: 'uint256',
            name: 'end',
            type: 'uint256',
          },
          {
            internalType: 'uint256',
            name: 'totalRewards',
            type: 'uint256',
          },
        ],
        internalType: 'struct RewardsV1.Epoch',
        name: 'epoch',
        type: 'tuple',
      },
    ],
    stateMutability: 'view',
    type: 'function',
  },
};

module.exports = {
  HubPoolAbi,
  RewardsV1Abi,
};
