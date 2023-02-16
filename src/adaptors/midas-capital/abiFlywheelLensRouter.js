module.exports = [
  {
    inputs: [
      {
        internalType: 'contract IComptroller',
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
            internalType: 'contract CErc20Token',
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
        internalType: 'address',
        name: 'user',
        type: 'address',
      },
      {
        internalType: 'contract CErc20Token[]',
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
