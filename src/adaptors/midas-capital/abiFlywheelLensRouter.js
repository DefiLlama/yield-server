module.exports = [
  {
    inputs: [
      {
        internalType: 'contract Comptroller',
        name: 'comptroller',
        type: 'address',
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
            internalType: 'contract CToken',
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
            internalType: 'struct FuseFlywheelLensRouter.RewardsInfo[]',
            name: 'rewardsInfo',
            type: 'tuple[]',
          },
        ],
        internalType: 'struct FuseFlywheelLensRouter.MarketRewardsInfo[]',
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
        internalType: 'address',
        name: 'user',
        type: 'address',
      },
      {
        internalType: 'contract CToken[]',
        name: 'markets',
        type: 'address[]',
      },
      {
        internalType: 'contract FuseFlywheelCore[]',
        name: 'flywheels',
        type: 'address[]',
      },
      {
        internalType: 'bool[]',
        name: 'accrue',
        type: 'bool[]',
      },
    ],
    name: 'getUnclaimedRewardsByMarkets',
    outputs: [
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
        internalType: 'contract CToken',
        name: 'market',
        type: 'address',
      },
      {
        internalType: 'contract FuseFlywheelCore[]',
        name: 'flywheels',
        type: 'address[]',
      },
      {
        internalType: 'bool[]',
        name: 'accrue',
        type: 'bool[]',
      },
    ],
    name: 'getUnclaimedRewardsForMarket',
    outputs: [
      {
        internalType: 'uint256[]',
        name: 'rewards',
        type: 'uint256[]',
      },
    ],
    stateMutability: 'nonpayable',
    type: 'function',
  },
];
