module.exports = {
  totalAvailable: {
    inputs: [],
    name: 'totalAvailable',
    outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  GHO_DISCOUNTED_PER_DISCOUNT_TOKEN: {
    inputs: [],
    name: 'GHO_DISCOUNTED_PER_DISCOUNT_TOKEN',
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
  getCurrentIndex: {
    inputs: [],
    name: 'getCurrentIndex',
    outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  rewardStates: {
    inputs: [
      {
        internalType: 'address',
        name: '',
        type: 'address',
      },
    ],
    name: 'rewardStates',
    outputs: [
      {
        internalType: 'uint256',
        name: 'rewardPerToken',
        type: 'uint256',
      },
      {
        internalType: 'uint256',
        name: 'lastUpdate',
        type: 'uint256',
      },
      {
        internalType: 'uint256',
        name: 'ratePerSecond',
        type: 'uint256',
      },
      {
        internalType: 'uint256',
        name: 'currentRewardAmount',
        type: 'uint256',
      },
      {
        internalType: 'uint256',
        name: 'queuedRewardAmount',
        type: 'uint256',
      },
      {
        internalType: 'uint256',
        name: 'distributionEndTimestamp',
        type: 'uint256',
      },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  getAllStakedTokenData: {
    inputs: [],
    name: 'getAllStakedTokenData',
    outputs: [
      {
        components: [
          {
            internalType: 'uint256',
            name: 'stakedTokenTotalSupply',
            type: 'uint256',
          },
          {
            internalType: 'uint256',
            name: 'stakedTokenTotalRedeemableAmount',
            type: 'uint256',
          },
          {
            internalType: 'uint256',
            name: 'stakeCooldownSeconds',
            type: 'uint256',
          },
          {
            internalType: 'uint256',
            name: 'stakeUnstakeWindow',
            type: 'uint256',
          },
          {
            internalType: 'uint256',
            name: 'stakedTokenPriceEth',
            type: 'uint256',
          },
          {
            internalType: 'uint256',
            name: 'rewardTokenPriceEth',
            type: 'uint256',
          },
          {
            internalType: 'uint256',
            name: 'stakeApy',
            type: 'uint256',
          },
          {
            internalType: 'uint128',
            name: 'distributionPerSecond',
            type: 'uint128',
          },
          {
            internalType: 'uint256',
            name: 'distributionEnd',
            type: 'uint256',
          },
        ],
        internalType: 'struct IStakedTokenDataProvider.StakedTokenData',
        name: 'stkAaveData',
        type: 'tuple',
      },
      {
        components: [
          {
            internalType: 'uint256',
            name: 'stakedTokenTotalSupply',
            type: 'uint256',
          },
          {
            internalType: 'uint256',
            name: 'stakedTokenTotalRedeemableAmount',
            type: 'uint256',
          },
          {
            internalType: 'uint256',
            name: 'stakeCooldownSeconds',
            type: 'uint256',
          },
          {
            internalType: 'uint256',
            name: 'stakeUnstakeWindow',
            type: 'uint256',
          },
          {
            internalType: 'uint256',
            name: 'stakedTokenPriceEth',
            type: 'uint256',
          },
          {
            internalType: 'uint256',
            name: 'rewardTokenPriceEth',
            type: 'uint256',
          },
          {
            internalType: 'uint256',
            name: 'stakeApy',
            type: 'uint256',
          },
          {
            internalType: 'uint128',
            name: 'distributionPerSecond',
            type: 'uint128',
          },
          {
            internalType: 'uint256',
            name: 'distributionEnd',
            type: 'uint256',
          },
        ],
        internalType: 'struct IStakedTokenDataProvider.StakedTokenData',
        name: 'stkBptData',
        type: 'tuple',
      },
      {
        internalType: 'uint256',
        name: 'ethPrice',
        type: 'uint256',
      },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  totalAssets: {
    inputs: [],
    name: 'totalAssets',
    outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  getAllPods: {
    inputs: [],
    name: 'getAllPods',
    outputs: [{ internalType: 'address[]', name: '', type: 'address[]' }],
    stateMutability: 'view',
    type: 'function',
  },
  pods: {
    inputs: [{ internalType: 'address', name: '', type: 'address' }],
    name: 'pods',
    outputs: [
      { internalType: 'address', name: 'podAddress', type: 'address' },
      { internalType: 'address', name: 'podOwner', type: 'address' },
      { internalType: 'address', name: 'collateral', type: 'address' },
      { internalType: 'uint96', name: 'lastUpdate', type: 'uint96' },
      { internalType: 'uint256', name: 'lastIndex', type: 'uint256' },
      { internalType: 'uint256', name: 'rentedAmount', type: 'uint256' },
      { internalType: 'uint256', name: 'accruedFees', type: 'uint256' },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  calculateDiscountRate: {
    inputs: [
      { internalType: 'uint256', name: 'debtBalance', type: 'uint256' },
      {
        internalType: 'uint256',
        name: 'discountTokenBalance',
        type: 'uint256',
      },
    ],
    name: 'calculateDiscountRate',
    outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    stateMutability: 'pure',
    type: 'function',
  },
  mintFeeRatio: {
    inputs: [],
    name: 'mintFeeRatio',
    outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  getGhoReserveData: {
    inputs: [],
    name: 'getGhoReserveData',
    outputs: [
      {
        components: [
          {
            internalType: 'uint256',
            name: 'ghoBaseVariableBorrowRate',
            type: 'uint256',
          },
          {
            internalType: 'uint256',
            name: 'ghoDiscountedPerToken',
            type: 'uint256',
          },
          {
            internalType: 'uint256',
            name: 'ghoDiscountRate',
            type: 'uint256',
          },
          {
            internalType: 'uint256',
            name: 'ghoMinDebtTokenBalanceForDiscount',
            type: 'uint256',
          },
          {
            internalType: 'uint256',
            name: 'ghoMinDiscountTokenBalanceForDiscount',
            type: 'uint256',
          },
          {
            internalType: 'uint40',
            name: 'ghoReserveLastUpdateTimestamp',
            type: 'uint40',
          },
          {
            internalType: 'uint128',
            name: 'ghoCurrentBorrowIndex',
            type: 'uint128',
          },
          {
            internalType: 'uint256',
            name: 'aaveFacilitatorBucketLevel',
            type: 'uint256',
          },
          {
            internalType: 'uint256',
            name: 'aaveFacilitatorBucketMaxCapacity',
            type: 'uint256',
          },
        ],
        internalType: 'struct IUiGhoDataProvider.GhoReserveData',
        name: '',
        type: 'tuple',
      },
    ],
    stateMutability: 'view',
    type: 'function',
  },
};
