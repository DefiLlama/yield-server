module.exports = [
  {
    "inputs": [
      {
        "internalType": "contract IPoolAddressesProvider",
        "name": "provider",
        "type": "address"
      }
    ],
    "name": "getReservesIncentivesData",
    "outputs": [
      {
        "components": [
          {
            "internalType": "address",
            "name": "underlyingAsset",
            "type": "address"
          },
          {
            "components": [
              {
                "internalType": "address",
                "name": "tokenAddress",
                "type": "address"
              },
              {
                "internalType": "address",
                "name": "incentiveControllerAddress",
                "type": "address"
              },
              {
                "components": [
                  {
                    "internalType": "string",
                    "name": "rewardTokenSymbol",
                    "type": "string"
                  },
                  {
                    "internalType": "address",
                    "name": "rewardTokenAddress",
                    "type": "address"
                  },
                  {
                    "internalType": "address",
                    "name": "rewardOracleAddress",
                    "type": "address"
                  },
                  {
                    "internalType": "uint256",
                    "name": "emissionPerSecond",
                    "type": "uint256"
                  },
                  {
                    "internalType": "uint256",
                    "name": "incentivesLastUpdateTimestamp",
                    "type": "uint256"
                  },
                  {
                    "internalType": "uint256",
                    "name": "tokenIncentivesIndex",
                    "type": "uint256"
                  },
                  {
                    "internalType": "uint256",
                    "name": "emissionEndTimestamp",
                    "type": "uint256"
                  },
                  {
                    "internalType": "int256",
                    "name": "rewardPriceFeed",
                    "type": "int256"
                  },
                  {
                    "internalType": "uint8",
                    "name": "rewardTokenDecimals",
                    "type": "uint8"
                  },
                  {
                    "internalType": "uint8",
                    "name": "precision",
                    "type": "uint8"
                  },
                  {
                    "internalType": "uint8",
                    "name": "priceFeedDecimals",
                    "type": "uint8"
                  }
                ],
                "internalType": "struct IUiIncentiveDataProviderV3.RewardInfo[]",
                "name": "rewardsTokenInformation",
                "type": "tuple[]"
              }
            ],
            "internalType": "struct IUiIncentiveDataProviderV3.IncentiveData",
            "name": "aIncentiveData",
            "type": "tuple"
          },
          {
            "components": [
              {
                "internalType": "address",
                "name": "tokenAddress",
                "type": "address"
              },
              {
                "internalType": "address",
                "name": "incentiveControllerAddress",
                "type": "address"
              },
              {
                "components": [
                  {
                    "internalType": "string",
                    "name": "rewardTokenSymbol",
                    "type": "string"
                  },
                  {
                    "internalType": "address",
                    "name": "rewardTokenAddress",
                    "type": "address"
                  },
                  {
                    "internalType": "address",
                    "name": "rewardOracleAddress",
                    "type": "address"
                  },
                  {
                    "internalType": "uint256",
                    "name": "emissionPerSecond",
                    "type": "uint256"
                  },
                  {
                    "internalType": "uint256",
                    "name": "incentivesLastUpdateTimestamp",
                    "type": "uint256"
                  },
                  {
                    "internalType": "uint256",
                    "name": "tokenIncentivesIndex",
                    "type": "uint256"
                  },
                  {
                    "internalType": "uint256",
                    "name": "emissionEndTimestamp",
                    "type": "uint256"
                  },
                  {
                    "internalType": "int256",
                    "name": "rewardPriceFeed",
                    "type": "int256"
                  },
                  {
                    "internalType": "uint8",
                    "name": "rewardTokenDecimals",
                    "type": "uint8"
                  },
                  {
                    "internalType": "uint8",
                    "name": "precision",
                    "type": "uint8"
                  },
                  {
                    "internalType": "uint8",
                    "name": "priceFeedDecimals",
                    "type": "uint8"
                  }
                ],
                "internalType": "struct IUiIncentiveDataProviderV3.RewardInfo[]",
                "name": "rewardsTokenInformation",
                "type": "tuple[]"
              }
            ],
            "internalType": "struct IUiIncentiveDataProviderV3.IncentiveData",
            "name": "vIncentiveData",
            "type": "tuple"
          },
          {
            "components": [
              {
                "internalType": "address",
                "name": "tokenAddress",
                "type": "address"
              },
              {
                "internalType": "address",
                "name": "incentiveControllerAddress",
                "type": "address"
              },
              {
                "components": [
                  {
                    "internalType": "string",
                    "name": "rewardTokenSymbol",
                    "type": "string"
                  },
                  {
                    "internalType": "address",
                    "name": "rewardTokenAddress",
                    "type": "address"
                  },
                  {
                    "internalType": "address",
                    "name": "rewardOracleAddress",
                    "type": "address"
                  },
                  {
                    "internalType": "uint256",
                    "name": "emissionPerSecond",
                    "type": "uint256"
                  },
                  {
                    "internalType": "uint256",
                    "name": "incentivesLastUpdateTimestamp",
                    "type": "uint256"
                  },
                  {
                    "internalType": "uint256",
                    "name": "tokenIncentivesIndex",
                    "type": "uint256"
                  },
                  {
                    "internalType": "uint256",
                    "name": "emissionEndTimestamp",
                    "type": "uint256"
                  },
                  {
                    "internalType": "int256",
                    "name": "rewardPriceFeed",
                    "type": "int256"
                  },
                  {
                    "internalType": "uint8",
                    "name": "rewardTokenDecimals",
                    "type": "uint8"
                  },
                  {
                    "internalType": "uint8",
                    "name": "precision",
                    "type": "uint8"
                  },
                  {
                    "internalType": "uint8",
                    "name": "priceFeedDecimals",
                    "type": "uint8"
                  }
                ],
                "internalType": "struct IUiIncentiveDataProviderV3.RewardInfo[]",
                "name": "rewardsTokenInformation",
                "type": "tuple[]"
              }
            ],
            "internalType": "struct IUiIncentiveDataProviderV3.IncentiveData",
            "name": "sIncentiveData",
            "type": "tuple"
          }
        ],
        "internalType": "struct IUiIncentiveDataProviderV3.AggregatedReserveIncentiveData[]",
        "name": "",
        "type": "tuple[]"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  }
]
