const abi = {
  getAllBucketsFactory: {
    "inputs": [
      {
        "internalType": "address",
        "name": "_bucketFactory",
        "type": "address"
      },
      {
        "internalType": "address",
        "name": "_user",
        "type": "address"
      },
      {
        "internalType": "address",
        "name": "_positionManager",
        "type": "address"
      },
      {
        "internalType": "bool",
        "name": "_showDeprecated",
        "type": "bool"
      }
    ],
    "name": "getAllBucketsFactory",
    "outputs": [
      {
        "components": [
          {
            "internalType": "address",
            "name": "bucketAddress",
            "type": "address"
          },
          {
            "internalType": "string",
            "name": "name",
            "type": "string"
          },
          {
            "components": [
              {
                "internalType": "address",
                "name": "tokenAddress",
                "type": "address"
              },
              {
                "internalType": "string",
                "name": "symbol",
                "type": "string"
              },
              {
                "internalType": "string",
                "name": "name",
                "type": "string"
              },
              {
                "internalType": "uint256",
                "name": "decimals",
                "type": "uint256"
              },
              {
                "internalType": "uint256",
                "name": "balance",
                "type": "uint256"
              }
            ],
            "internalType": "struct IPrimexLens.TokenMetadata",
            "name": "asset",
            "type": "tuple"
          },
          {
            "internalType": "uint128",
            "name": "bar",
            "type": "uint128"
          },
          {
            "internalType": "uint128",
            "name": "lar",
            "type": "uint128"
          },
          {
            "internalType": "uint256",
            "name": "supply",
            "type": "uint256"
          },
          {
            "internalType": "uint256",
            "name": "demand",
            "type": "uint256"
          },
          {
            "internalType": "uint256",
            "name": "availableLiquidity",
            "type": "uint256"
          },
          {
            "internalType": "uint256",
            "name": "utilizationRatio",
            "type": "uint256"
          },
          {
            "components": [
              {
                "components": [
                  {
                    "internalType": "address",
                    "name": "tokenAddress",
                    "type": "address"
                  },
                  {
                    "internalType": "string",
                    "name": "symbol",
                    "type": "string"
                  },
                  {
                    "internalType": "string",
                    "name": "name",
                    "type": "string"
                  },
                  {
                    "internalType": "uint256",
                    "name": "decimals",
                    "type": "uint256"
                  },
                  {
                    "internalType": "uint256",
                    "name": "balance",
                    "type": "uint256"
                  }
                ],
                "internalType": "struct IPrimexLens.TokenMetadata",
                "name": "asset",
                "type": "tuple"
              },
              {
                "components": [
                  {
                    "internalType": "uint256",
                    "name": "id",
                    "type": "uint256"
                  },
                  {
                    "internalType": "bool",
                    "name": "isSupported",
                    "type": "bool"
                  },
                  {
                    "internalType": "uint256",
                    "name": "pairPriceDrop",
                    "type": "uint256"
                  },
                  {
                    "internalType": "uint256",
                    "name": "maxLeverage",
                    "type": "uint256"
                  }
                ],
                "internalType": "struct IPrimexLens.BucketTokenMetadata",
                "name": "properties",
                "type": "tuple"
              }
            ],
            "internalType": "struct IPrimexLens.SupportedAsset[]",
            "name": "supportedAssets",
            "type": "tuple[]"
          },
          {
            "components": [
              {
                "internalType": "address",
                "name": "tokenAddress",
                "type": "address"
              },
              {
                "internalType": "string",
                "name": "symbol",
                "type": "string"
              },
              {
                "internalType": "string",
                "name": "name",
                "type": "string"
              },
              {
                "internalType": "uint256",
                "name": "decimals",
                "type": "uint256"
              },
              {
                "internalType": "uint256",
                "name": "balance",
                "type": "uint256"
              }
            ],
            "internalType": "struct IPrimexLens.TokenMetadata",
            "name": "pToken",
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
                "internalType": "string",
                "name": "symbol",
                "type": "string"
              },
              {
                "internalType": "string",
                "name": "name",
                "type": "string"
              },
              {
                "internalType": "uint256",
                "name": "decimals",
                "type": "uint256"
              },
              {
                "internalType": "uint256",
                "name": "balance",
                "type": "uint256"
              }
            ],
            "internalType": "struct IPrimexLens.TokenMetadata",
            "name": "debtToken",
            "type": "tuple"
          },
          {
            "internalType": "uint256",
            "name": "feeBuffer",
            "type": "uint256"
          },
          {
            "internalType": "uint256",
            "name": "withdrawalFeeRate",
            "type": "uint256"
          },
          {
            "components": [
              {
                "internalType": "contract ILiquidityMiningRewardDistributor",
                "name": "liquidityMiningRewardDistributor",
                "type": "address"
              },
              {
                "internalType": "bool",
                "name": "isBucketLaunched",
                "type": "bool"
              },
              {
                "internalType": "uint256",
                "name": "accumulatingAmount",
                "type": "uint256"
              },
              {
                "internalType": "uint256",
                "name": "deadlineTimestamp",
                "type": "uint256"
              },
              {
                "internalType": "uint256",
                "name": "stabilizationDuration",
                "type": "uint256"
              },
              {
                "internalType": "uint256",
                "name": "stabilizationEndTimestamp",
                "type": "uint256"
              },
              {
                "internalType": "uint256",
                "name": "maxAmountPerUser",
                "type": "uint256"
              },
              {
                "internalType": "uint256",
                "name": "maxDuration",
                "type": "uint256"
              },
              {
                "internalType": "uint256",
                "name": "maxStabilizationEndTimestamp",
                "type": "uint256"
              }
            ],
            "internalType": "struct IBucketStorage.LiquidityMiningParams",
            "name": "miningParams",
            "type": "tuple"
          },
          {
            "components": [
              {
                "internalType": "uint256",
                "name": "amountInMining",
                "type": "uint256"
              },
              {
                "internalType": "uint256",
                "name": "currentPercent",
                "type": "uint256"
              },
              {
                "components": [
                  {
                    "internalType": "uint256",
                    "name": "minReward",
                    "type": "uint256"
                  },
                  {
                    "internalType": "uint256",
                    "name": "maxReward",
                    "type": "uint256"
                  },
                  {
                    "internalType": "uint256",
                    "name": "extraReward",
                    "type": "uint256"
                  }
                ],
                "internalType": "struct ILiquidityMiningRewardDistributor.RewardsInPMX",
                "name": "rewardsInPMX",
                "type": "tuple"
              }
            ],
            "internalType": "struct IPrimexLens.LenderInfo",
            "name": "lenderInfo",
            "type": "tuple"
          },
          {
            "components": [
              {
                "internalType": "uint256",
                "name": "pmxAmount",
                "type": "uint256"
              },
              {
                "internalType": "uint256",
                "name": "withdrawnRewards",
                "type": "uint256"
              },
              {
                "internalType": "uint256",
                "name": "totalPoints",
                "type": "uint256"
              }
            ],
            "internalType": "struct IPrimexLens.LiquidityMiningBucketInfo",
            "name": "lmBucketInfo",
            "type": "tuple"
          },
          {
            "internalType": "uint128",
            "name": "estimatedBar",
            "type": "uint128"
          },
          {
            "internalType": "uint128",
            "name": "estimatedLar",
            "type": "uint128"
          },
          {
            "internalType": "bool",
            "name": "isDeprecated",
            "type": "bool"
          },
          {
            "internalType": "bool",
            "name": "isDelisted",
            "type": "bool"
          },
          {
            "components": [
              {
                "internalType": "uint256",
                "name": "urOptimal",
                "type": "uint256"
              },
              {
                "internalType": "uint256",
                "name": "k0",
                "type": "uint256"
              },
              {
                "internalType": "uint256",
                "name": "k1",
                "type": "uint256"
              },
              {
                "internalType": "uint256",
                "name": "b0",
                "type": "uint256"
              },
              {
                "internalType": "int256",
                "name": "b1",
                "type": "int256"
              }
            ],
            "internalType": "struct IInterestRateStrategy.BarCalculationParams",
            "name": "barCalcParams",
            "type": "tuple"
          },
          {
            "internalType": "uint256",
            "name": "maxTotalDeposit",
            "type": "uint256"
          }
        ],
        "internalType": "struct IPrimexLens.BucketMetaData[]",
        "name": "",
        "type": "tuple[]"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  activityRewardDistributorBuckets: {
    "inputs": [
      {
        "internalType": "address",
        "name": "",
        "type": "address"
      },
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "name": "buckets",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "rewardIndex",
        "type": "uint256"
      },
      {
        "internalType": "uint256",
        "name": "lastUpdatedTimestamp",
        "type": "uint256"
      },
      {
        "internalType": "uint256",
        "name": "rewardPerToken",
        "type": "uint256"
      },
      {
        "internalType": "uint256",
        "name": "scaledTotalSupply",
        "type": "uint256"
      },
      {
        "internalType": "bool",
        "name": "isFinished",
        "type": "bool"
      },
      {
        "internalType": "uint256",
        "name": "fixedReward",
        "type": "uint256"
      },
      {
        "internalType": "uint256",
        "name": "lastUpdatedRewardTimestamp",
        "type": "uint256"
      },
      {
        "internalType": "uint256",
        "name": "rewardPerDay",
        "type": "uint256"
      },
      {
        "internalType": "uint256",
        "name": "totalReward",
        "type": "uint256"
      },
      {
        "internalType": "uint256",
        "name": "endTimestamp",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  getChainlinkLatestRoundData: {
    "inputs": [
      {
        "internalType": "address[]",
        "name": "_feeds",
        "type": "address[]"
      }
    ],
    "name": "getChainlinkLatestRoundData",
    "outputs": [
      {
        "components": [
          {
            "internalType": "uint80",
            "name": "roundId",
            "type": "uint80"
          },
          {
            "internalType": "int256",
            "name": "answer",
            "type": "int256"
          },
          {
            "internalType": "uint256",
            "name": "startedAt",
            "type": "uint256"
          },
          {
            "internalType": "uint256",
            "name": "updatedAt",
            "type": "uint256"
          },
          {
            "internalType": "uint80",
            "name": "answeredInRound",
            "type": "uint80"
          }
        ],
        "internalType": "struct IPrimexLens.RoundData[]",
        "name": "",
        "type": "tuple[]"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  }
}

module.exports = { abi }