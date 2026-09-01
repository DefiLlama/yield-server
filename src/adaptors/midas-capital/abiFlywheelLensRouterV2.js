module.exports = [
  {
    inputs: [
      {
        internalType: 'contract FusePoolDirectory',
        name: '_fpd',
        type: 'address',
      },
    ],
    stateMutability: 'nonpayable',
    type: 'constructor',
  },
  {
    inputs: [
      {
        internalType: 'address',
        name: 'user',
        type: 'address',
      },
    ],
    name: 'claimAllRewardTokens',
    outputs: [
      {
        internalType: 'address[]',
        name: '',
        type: 'address[]',
      },
      {
        internalType: 'uint256[]',
        name: '',
        type: 'uint256[]',
      },
    ],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      {
        internalType: 'address',
        name: 'user',
        type: 'address',
      },
      {
        internalType: 'contract ERC20',
        name: 'market',
        type: 'address',
      },
      {
        internalType: 'contract MidasFlywheelCore[]',
        name: 'flywheels',
        type: 'address[]',
      },
      {
        internalType: 'bool[]',
        name: 'accrue',
        type: 'bool[]',
      },
    ],
    name: 'claimRewardsForMarket',
    outputs: [
      {
        internalType: 'contract MidasFlywheelCore[]',
        name: '',
        type: 'address[]',
      },
      {
        internalType: 'address[]',
        name: 'rewardTokens',
        type: 'address[]',
      },
      {
        internalType: 'uint256[]',
        name: 'rewards',
        type: 'uint256[]',
      },
    ],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      {
        internalType: 'address',
        name: 'user',
        type: 'address',
      },
      {
        internalType: 'contract ERC20[]',
        name: 'markets',
        type: 'address[]',
      },
      {
        internalType: 'contract MidasFlywheelCore[]',
        name: 'flywheels',
        type: 'address[]',
      },
      {
        internalType: 'bool[]',
        name: 'accrue',
        type: 'bool[]',
      },
    ],
    name: 'claimRewardsForMarkets',
    outputs: [
      {
        internalType: 'contract MidasFlywheelCore[]',
        name: '',
        type: 'address[]',
      },
      {
        internalType: 'address[]',
        name: 'rewardTokens',
        type: 'address[]',
      },
      {
        internalType: 'uint256[]',
        name: 'rewards',
        type: 'uint256[]',
      },
    ],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      {
        internalType: 'address',
        name: 'user',
        type: 'address',
      },
      {
        internalType: 'contract IComptroller',
        name: 'comptroller',
        type: 'address',
      },
    ],
    name: 'claimRewardsForPool',
    outputs: [
      {
        internalType: 'contract MidasFlywheelCore[]',
        name: '',
        type: 'address[]',
      },
      {
        internalType: 'address[]',
        name: '',
        type: 'address[]',
      },
      {
        internalType: 'uint256[]',
        name: '',
        type: 'uint256[]',
      },
    ],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      {
        internalType: 'address',
        name: 'user',
        type: 'address',
      },
      {
        internalType: 'address',
        name: 'rewardToken',
        type: 'address',
      },
    ],
    name: 'claimRewardsOfRewardToken',
    outputs: [
      {
        internalType: 'uint256',
        name: 'rewardsClaimed',
        type: 'uint256',
      },
    ],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [],
    name: 'fpd',
    outputs: [
      {
        internalType: 'contract FusePoolDirectory',
        name: '',
        type: 'address',
      },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'getAllRewardTokens',
    outputs: [
      {
        internalType: 'address[]',
        name: 'uniqueRewardTokens',
        type: 'address[]',
      },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      {
        internalType: 'contract ICErc20[]',
        name: 'markets',
        type: 'address[]',
      },
    ],
    name: 'getMarketRewardsInfo',
    outputs: [
      {
        components: [
          {
            internalType: 'uint256',
            name: 'underlyingPrice',
            type: 'uint256',
          },
          {
            internalType: 'contract ICErc20',
            name: 'market',
            type: 'address',
          },
          {
            components: [
              {
                internalType: 'uint256',
                name: 'rewardSpeedPerSecondPerToken',
                type: 'uint256',
              },
              {
                internalType: 'uint256',
                name: 'rewardTokenPrice',
                type: 'uint256',
              },
              {
                internalType: 'uint256',
                name: 'formattedAPR',
                type: 'uint256',
              },
              {
                internalType: 'address',
                name: 'flywheel',
                type: 'address',
              },
              {
                internalType: 'address',
                name: 'rewardToken',
                type: 'address',
              },
            ],
            internalType: 'struct MidasFlywheelLensRouter.RewardsInfo[]',
            name: 'rewardsInfo',
            type: 'tuple[]',
          },
        ],
        internalType: 'struct MidasFlywheelLensRouter.MarketRewardsInfo[]',
        name: '',
        type: 'tuple[]',
      },
    ],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      {
        internalType: 'contract IComptroller',
        name: 'comptroller',
        type: 'address',
      },
    ],
    name: 'getPoolMarketRewardsInfo',
    outputs: [
      {
        components: [
          {
            internalType: 'uint256',
            name: 'underlyingPrice',
            type: 'uint256',
          },
          {
            internalType: 'contract ICErc20',
            name: 'market',
            type: 'address',
          },
          {
            components: [
              {
                internalType: 'uint256',
                name: 'rewardSpeedPerSecondPerToken',
                type: 'uint256',
              },
              {
                internalType: 'uint256',
                name: 'rewardTokenPrice',
                type: 'uint256',
              },
              {
                internalType: 'uint256',
                name: 'formattedAPR',
                type: 'uint256',
              },
              {
                internalType: 'address',
                name: 'flywheel',
                type: 'address',
              },
              {
                internalType: 'address',
                name: 'rewardToken',
                type: 'address',
              },
            ],
            internalType: 'struct MidasFlywheelLensRouter.RewardsInfo[]',
            name: 'rewardsInfo',
            type: 'tuple[]',
          },
        ],
        internalType: 'struct MidasFlywheelLensRouter.MarketRewardsInfo[]',
        name: '',
        type: 'tuple[]',
      },
    ],
    stateMutability: 'nonpayable',
    type: 'function',
  },
];
