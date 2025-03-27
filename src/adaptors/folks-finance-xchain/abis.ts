const LoanManagerAbi = {
  getLoanPool: {
    inputs: [
      {
        internalType: 'uint16',
        name: 'loanTypeId',
        type: 'uint16',
      },
      {
        internalType: 'uint8',
        name: 'poolId',
        type: 'uint8',
      },
    ],
    name: 'getLoanPool',
    outputs: [
      {
        components: [
          {
            internalType: 'uint256',
            name: 'collateralUsed',
            type: 'uint256',
          },
          {
            internalType: 'uint256',
            name: 'borrowUsed',
            type: 'uint256',
          },
          {
            internalType: 'uint64',
            name: 'collateralCap',
            type: 'uint64',
          },
          {
            internalType: 'uint64',
            name: 'borrowCap',
            type: 'uint64',
          },
          {
            internalType: 'uint16',
            name: 'collateralFactor',
            type: 'uint16',
          },
          {
            internalType: 'uint16',
            name: 'borrowFactor',
            type: 'uint16',
          },
          {
            internalType: 'uint16',
            name: 'liquidationBonus',
            type: 'uint16',
          },
          {
            internalType: 'uint16',
            name: 'liquidationFee',
            type: 'uint16',
          },
          {
            internalType: 'bool',
            name: 'isAdded',
            type: 'bool',
          },
          {
            internalType: 'bool',
            name: 'isDeprecated',
            type: 'bool',
          },
          {
            components: [
              {
                internalType: 'uint64',
                name: 'lastUpdateTimestamp',
                type: 'uint64',
              },
              {
                internalType: 'uint256',
                name: 'minimumAmount',
                type: 'uint256',
              },
              {
                internalType: 'uint256',
                name: 'collateralSpeed',
                type: 'uint256',
              },
              {
                internalType: 'uint256',
                name: 'borrowSpeed',
                type: 'uint256',
              },
              {
                internalType: 'uint256',
                name: 'collateralRewardIndex',
                type: 'uint256',
              },
              {
                internalType: 'uint256',
                name: 'borrowRewardIndex',
                type: 'uint256',
              },
            ],
            internalType: 'struct LoanManagerState.LoanPoolReward',
            name: 'reward',
            type: 'tuple',
          },
        ],
        internalType: 'struct LoanManagerState.LoanPool',
        name: '',
        type: 'tuple',
      },
    ],
    stateMutability: 'view',
    type: 'function',
  },
};

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

const RewardsV2Abi = {
  getActivePoolEpoch: {
    inputs: [
      {
        internalType: 'uint8',
        name: 'poolId',
        type: 'uint8',
      },
    ],
    name: 'getActivePoolEpoch',
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
            components: [
              {
                internalType: 'uint8',
                name: 'rewardTokenId',
                type: 'uint8',
              },
              {
                internalType: 'uint256',
                name: 'totalRewards',
                type: 'uint256',
              },
            ],
            internalType: 'struct HubRewardsV2.EpochReward[]',
            name: 'rewards',
            type: 'tuple[]',
          },
        ],
        internalType: 'struct HubRewardsV2.Epoch',
        name: 'epoch',
        type: 'tuple',
      },
    ],
    stateMutability: 'view',
    type: 'function',
  },
};

module.exports = {
  LoanManagerAbi,
  HubPoolAbi,
  RewardsV2Abi,
};
