module.exports = {
    ethABI: [
        {
          "anonymous": false,
          "inputs": [
            {
              "indexed": false,
              "internalType": "address",
              "name": "_newTokenAddress",
              "type": "address"
            }
          ],
          "name": "MembershipTokenUpdated",
          "type": "event"
        },
        {
          "anonymous": false,
          "inputs": [
            {
              "indexed": true,
              "internalType": "address",
              "name": "previousOwner",
              "type": "address"
            },
            {
              "indexed": true,
              "internalType": "address",
              "name": "newOwner",
              "type": "address"
            }
          ],
          "name": "OwnershipTransferred",
          "type": "event"
        },
        {
          "anonymous": false,
          "inputs": [
            {
              "indexed": false,
              "internalType": "address",
              "name": "account",
              "type": "address"
            }
          ],
          "name": "Paused",
          "type": "event"
        },
        {
          "anonymous": false,
          "inputs": [
            {
              "indexed": false,
              "internalType": "address",
              "name": "account",
              "type": "address"
            }
          ],
          "name": "Unpaused",
          "type": "event"
        },
        {
          "inputs": [
            {
              "internalType": "address",
              "name": "_pool",
              "type": "address"
            }
          ],
          "name": "canReceiveRewards",
          "outputs": [
            {
              "internalType": "bool",
              "name": "",
              "type": "bool"
            }
          ],
          "stateMutability": "view",
          "type": "function"
        },
        {
          "inputs": [],
          "name": "claimAllRewards",
          "outputs": [],
          "stateMutability": "nonpayable",
          "type": "function"
        },
        {
          "inputs": [
            {
              "internalType": "address",
              "name": "_pool",
              "type": "address"
            }
          ],
          "name": "claimReward",
          "outputs": [
            {
              "internalType": "bool",
              "name": "",
              "type": "bool"
            }
          ],
          "stateMutability": "nonpayable",
          "type": "function"
        },
        {
          "inputs": [
            {
              "internalType": "contract IUZV1RewardPool[]",
              "name": "pools",
              "type": "address[]"
            }
          ],
          "name": "claimRewardsFor",
          "outputs": [],
          "stateMutability": "nonpayable",
          "type": "function"
        },
        {
          "inputs": [
            {
              "internalType": "uint256",
              "name": "totalRewards",
              "type": "uint256"
            },
            {
              "internalType": "uint256",
              "name": "startBlock",
              "type": "uint256"
            },
            {
              "internalType": "uint256",
              "name": "endBlock",
              "type": "uint256"
            },
            {
              "internalType": "address",
              "name": "token",
              "type": "address"
            },
            {
              "internalType": "uint8",
              "name": "poolType",
              "type": "uint8"
            },
            {
              "internalType": "string",
              "name": "name",
              "type": "string"
            },
            {
              "internalType": "string",
              "name": "blockchain",
              "type": "string"
            },
            {
              "internalType": "string",
              "name": "cAddress",
              "type": "string"
            }
          ],
          "name": "createNewPool",
          "outputs": [
            {
              "internalType": "address",
              "name": "",
              "type": "address"
            }
          ],
          "stateMutability": "nonpayable",
          "type": "function"
        },
        {
          "inputs": [
            {
              "internalType": "address",
              "name": "_token",
              "type": "address"
            },
            {
              "internalType": "uint256",
              "name": "_amount",
              "type": "uint256"
            }
          ],
          "name": "emergencyWithdrawTokenFromRouter",
          "outputs": [],
          "stateMutability": "nonpayable",
          "type": "function"
        },
        {
          "inputs": [],
          "name": "factory",
          "outputs": [
            {
              "internalType": "contract IUZV1Factory",
              "name": "",
              "type": "address"
            }
          ],
          "stateMutability": "view",
          "type": "function"
        },
        {
          "inputs": [],
          "name": "getAllPools",
          "outputs": [
            {
              "internalType": "address[]",
              "name": "",
              "type": "address[]"
            }
          ],
          "stateMutability": "view",
          "type": "function"
        },
        {
          "inputs": [],
          "name": "getAllTokens",
          "outputs": [
            {
              "internalType": "address[]",
              "name": "tokenList",
              "type": "address[]"
            },
            {
              "internalType": "uint256[]",
              "name": "tokenTVLs",
              "type": "uint256[]"
            },
            {
              "internalType": "uint256[]",
              "name": "weights",
              "type": "uint256[]"
            },
            {
              "internalType": "uint256",
              "name": "combinedWeight",
              "type": "uint256"
            }
          ],
          "stateMutability": "view",
          "type": "function"
        },
        {
          "inputs": [
            {
              "internalType": "uint256",
              "name": "_blocknumber",
              "type": "uint256"
            }
          ],
          "name": "getAllTokens",
          "outputs": [
            {
              "internalType": "address[]",
              "name": "tokenList",
              "type": "address[]"
            },
            {
              "internalType": "uint256[]",
              "name": "tokenTVLs",
              "type": "uint256[]"
            },
            {
              "internalType": "uint256[]",
              "name": "weights",
              "type": "uint256[]"
            },
            {
              "internalType": "uint256",
              "name": "combinedWeight",
              "type": "uint256"
            }
          ],
          "stateMutability": "view",
          "type": "function"
        },
        {
          "inputs": [
            {
              "internalType": "address",
              "name": "_user",
              "type": "address"
            }
          ],
          "name": "getAllUserRewards",
          "outputs": [
            {
              "internalType": "address[]",
              "name": "",
              "type": "address[]"
            },
            {
              "internalType": "uint256[]",
              "name": "",
              "type": "uint256[]"
            }
          ],
          "stateMutability": "view",
          "type": "function"
        },
        {
          "inputs": [
            {
              "internalType": "address",
              "name": "_pool",
              "type": "address"
            }
          ],
          "name": "getAmountOfOpenRewards",
          "outputs": [
            {
              "internalType": "uint256",
              "name": "",
              "type": "uint256"
            }
          ],
          "stateMutability": "view",
          "type": "function"
        },
        {
          "inputs": [
            {
              "internalType": "address",
              "name": "_pool",
              "type": "address"
            }
          ],
          "name": "getPoolInfo",
          "outputs": [
            {
              "components": [
                {
                  "internalType": "enum SharedDataTypes.PoolState",
                  "name": "state",
                  "type": "uint8"
                },
                {
                  "components": [
                    {
                      "internalType": "string",
                      "name": "name",
                      "type": "string"
                    },
                    {
                      "internalType": "string",
                      "name": "blockchain",
                      "type": "string"
                    },
                    {
                      "internalType": "string",
                      "name": "cAddress",
                      "type": "string"
                    }
                  ],
                  "internalType": "struct SharedDataTypes.PoolInfo",
                  "name": "info",
                  "type": "tuple"
                },
                {
                  "internalType": "uint256",
                  "name": "startBlock",
                  "type": "uint256"
                },
                {
                  "internalType": "uint256",
                  "name": "endBlock",
                  "type": "uint256"
                },
                {
                  "internalType": "uint256",
                  "name": "paymentStartBlock",
                  "type": "uint256"
                },
                {
                  "internalType": "uint256",
                  "name": "paymentEndBlock",
                  "type": "uint256"
                },
                {
                  "internalType": "uint256",
                  "name": "distributionStartBlock",
                  "type": "uint256"
                },
                {
                  "internalType": "uint256",
                  "name": "distributionEndBlock",
                  "type": "uint256"
                },
                {
                  "internalType": "uint256",
                  "name": "totalRewards",
                  "type": "uint256"
                },
                {
                  "internalType": "uint256",
                  "name": "rewardsPerBlock",
                  "type": "uint256"
                },
                {
                  "internalType": "uint256",
                  "name": "rewardTokenPrice",
                  "type": "uint256"
                },
                {
                  "internalType": "uint8",
                  "name": "poolType",
                  "type": "uint8"
                },
                {
                  "internalType": "address",
                  "name": "paymentToken",
                  "type": "address"
                },
                {
                  "internalType": "address",
                  "name": "token",
                  "type": "address"
                },
                {
                  "internalType": "address",
                  "name": "rewardPool",
                  "type": "address"
                }
              ],
              "internalType": "struct SharedDataTypes.PoolData",
              "name": "",
              "type": "tuple"
            }
          ],
          "stateMutability": "view",
          "type": "function"
        },
        {
          "inputs": [
            {
              "internalType": "address",
              "name": "_user",
              "type": "address"
            }
          ],
          "name": "getPoolStakerUser",
          "outputs": [
            {
              "components": [
                {
                  "internalType": "uint256",
                  "name": "totalSavedRewards",
                  "type": "uint256"
                },
                {
                  "internalType": "uint256",
                  "name": "totalPurchasedAllocation",
                  "type": "uint256"
                },
                {
                  "internalType": "string",
                  "name": "nativeAddress",
                  "type": "string"
                },
                {
                  "internalType": "uint256",
                  "name": "claimedTime",
                  "type": "uint256"
                },
                {
                  "internalType": "uint256[]",
                  "name": "claimedBlocks",
                  "type": "uint256[]"
                }
              ],
              "internalType": "struct SharedDataTypes.PoolStakerUser[]",
              "name": "",
              "type": "tuple[]"
            }
          ],
          "stateMutability": "view",
          "type": "function"
        },
        {
          "inputs": [
            {
              "internalType": "address",
              "name": "_pool",
              "type": "address"
            }
          ],
          "name": "getPoolState",
          "outputs": [
            {
              "internalType": "enum SharedDataTypes.PoolState",
              "name": "",
              "type": "uint8"
            }
          ],
          "stateMutability": "view",
          "type": "function"
        },
        {
          "inputs": [
            {
              "internalType": "address",
              "name": "_pool",
              "type": "address"
            }
          ],
          "name": "getPoolType",
          "outputs": [
            {
              "internalType": "uint8",
              "name": "",
              "type": "uint8"
            }
          ],
          "stateMutability": "view",
          "type": "function"
        },
        {
          "inputs": [
            {
              "internalType": "address",
              "name": "_pool",
              "type": "address"
            },
            {
              "internalType": "address",
              "name": "_user",
              "type": "address"
            }
          ],
          "name": "getPoolUserInfo",
          "outputs": [
            {
              "components": [
                {
                  "internalType": "address[]",
                  "name": "tokens",
                  "type": "address[]"
                },
                {
                  "internalType": "uint256[]",
                  "name": "amounts",
                  "type": "uint256[]"
                },
                {
                  "internalType": "uint256",
                  "name": "pendingRewards",
                  "type": "uint256"
                },
                {
                  "internalType": "uint256",
                  "name": "totalPurchasedAllocation",
                  "type": "uint256"
                },
                {
                  "internalType": "uint256",
                  "name": "totalSavedRewards",
                  "type": "uint256"
                },
                {
                  "internalType": "uint256",
                  "name": "claimedTime",
                  "type": "uint256"
                },
                {
                  "internalType": "enum SharedDataTypes.PoolState",
                  "name": "state",
                  "type": "uint8"
                },
                {
                  "internalType": "enum SharedDataTypes.UserPoolState",
                  "name": "userState",
                  "type": "uint8"
                }
              ],
              "internalType": "struct SharedDataTypes.FlatPoolStakerUser",
              "name": "",
              "type": "tuple"
            }
          ],
          "stateMutability": "view",
          "type": "function"
        },
        {
          "inputs": [
            {
              "internalType": "address",
              "name": "_pool",
              "type": "address"
            },
            {
              "internalType": "address",
              "name": "_user",
              "type": "address"
            }
          ],
          "name": "getPoolUserReceiverAddress",
          "outputs": [
            {
              "internalType": "string",
              "name": "receiverAddress",
              "type": "string"
            }
          ],
          "stateMutability": "view",
          "type": "function"
        },
        {
          "inputs": [
            {
              "internalType": "address",
              "name": "_user",
              "type": "address"
            }
          ],
          "name": "getStakingUserData",
          "outputs": [
            {
              "internalType": "address[]",
              "name": "",
              "type": "address[]"
            },
            {
              "internalType": "uint256[]",
              "name": "",
              "type": "uint256[]"
            },
            {
              "internalType": "uint256",
              "name": "",
              "type": "uint256"
            }
          ],
          "stateMutability": "view",
          "type": "function"
        },
        {
          "inputs": [],
          "name": "getTVLs",
          "outputs": [
            {
              "internalType": "uint256[]",
              "name": "_tokenTVLs",
              "type": "uint256[]"
            }
          ],
          "stateMutability": "view",
          "type": "function"
        },
        {
          "inputs": [
            {
              "internalType": "address",
              "name": "_pool",
              "type": "address"
            }
          ],
          "name": "getTimeWindows",
          "outputs": [
            {
              "internalType": "uint256[]",
              "name": "",
              "type": "uint256[]"
            }
          ],
          "stateMutability": "view",
          "type": "function"
        },
        {
          "inputs": [],
          "name": "getTokenWeights",
          "outputs": [
            {
              "internalType": "uint256[]",
              "name": "weights",
              "type": "uint256[]"
            },
            {
              "internalType": "uint256",
              "name": "combinedWeight",
              "type": "uint256"
            }
          ],
          "stateMutability": "view",
          "type": "function"
        },
        {
          "inputs": [
            {
              "internalType": "address",
              "name": "_pool",
              "type": "address"
            },
            {
              "internalType": "address",
              "name": "_user",
              "type": "address"
            }
          ],
          "name": "getTotalPriceForPurchaseableTokens",
          "outputs": [
            {
              "internalType": "uint256",
              "name": "",
              "type": "uint256"
            }
          ],
          "stateMutability": "view",
          "type": "function"
        },
        {
          "inputs": [
            {
              "internalType": "address",
              "name": "_pool",
              "type": "address"
            }
          ],
          "name": "getUserPoolState",
          "outputs": [
            {
              "internalType": "enum SharedDataTypes.UserPoolState",
              "name": "",
              "type": "uint8"
            }
          ],
          "stateMutability": "view",
          "type": "function"
        },
        {
          "inputs": [
            {
              "internalType": "address",
              "name": "_user",
              "type": "address"
            },
            {
              "internalType": "uint256",
              "name": "_blocknumber",
              "type": "uint256"
            }
          ],
          "name": "getUserStakes",
          "outputs": [
            {
              "internalType": "uint256[]",
              "name": "",
              "type": "uint256[]"
            }
          ],
          "stateMutability": "view",
          "type": "function"
        },
        {
          "inputs": [
            {
              "internalType": "address",
              "name": "_user",
              "type": "address"
            }
          ],
          "name": "getUserStakes",
          "outputs": [
            {
              "internalType": "uint256[]",
              "name": "",
              "type": "uint256[]"
            }
          ],
          "stateMutability": "view",
          "type": "function"
        },
        {
          "inputs": [
            {
              "internalType": "address",
              "name": "_user",
              "type": "address"
            },
            {
              "internalType": "address",
              "name": "_token",
              "type": "address"
            },
            {
              "internalType": "uint256",
              "name": "_startBlock",
              "type": "uint256"
            },
            {
              "internalType": "uint256",
              "name": "_endBlock",
              "type": "uint256"
            },
            {
              "internalType": "uint256[]",
              "name": "_claimedBlocks",
              "type": "uint256[]"
            }
          ],
          "name": "getUserStakesSnapshots",
          "outputs": [
            {
              "components": [
                {
                  "internalType": "uint256",
                  "name": "startBlock",
                  "type": "uint256"
                },
                {
                  "internalType": "uint256",
                  "name": "endBlock",
                  "type": "uint256"
                },
                {
                  "internalType": "uint256",
                  "name": "stakedAmount",
                  "type": "uint256"
                },
                {
                  "internalType": "uint256",
                  "name": "startTVL",
                  "type": "uint256"
                },
                {
                  "internalType": "uint256",
                  "name": "endTVL",
                  "type": "uint256"
                }
              ],
              "internalType": "struct SharedDataTypes.StakeSnapshot[]",
              "name": "snapshots",
              "type": "tuple[]"
            }
          ],
          "stateMutability": "view",
          "type": "function"
        },
        {
          "inputs": [
            {
              "internalType": "address",
              "name": "_user",
              "type": "address"
            },
            {
              "internalType": "uint256",
              "name": "_precision",
              "type": "uint256"
            }
          ],
          "name": "getUserTVLShare",
          "outputs": [
            {
              "internalType": "uint256[]",
              "name": "",
              "type": "uint256[]"
            }
          ],
          "stateMutability": "view",
          "type": "function"
        },
        {
          "inputs": [
            {
              "internalType": "address",
              "name": "_user",
              "type": "address"
            },
            {
              "internalType": "address",
              "name": "_token",
              "type": "address"
            }
          ],
          "name": "getUsersStakedAmountOfToken",
          "outputs": [
            {
              "internalType": "uint256",
              "name": "",
              "type": "uint256"
            }
          ],
          "stateMutability": "view",
          "type": "function"
        },
        {
          "inputs": [
            {
              "internalType": "address",
              "name": "_factory",
              "type": "address"
            },
            {
              "internalType": "address",
              "name": "_staking",
              "type": "address"
            },
            {
              "internalType": "address",
              "name": "_accessToken",
              "type": "address"
            }
          ],
          "name": "initialize",
          "outputs": [],
          "stateMutability": "nonpayable",
          "type": "function"
        },
        {
          "inputs": [
            {
              "internalType": "address",
              "name": "_token",
              "type": "address"
            }
          ],
          "name": "initialize",
          "outputs": [],
          "stateMutability": "nonpayable",
          "type": "function"
        },
        {
          "inputs": [
            {
              "internalType": "address",
              "name": "_pool",
              "type": "address"
            }
          ],
          "name": "isPoolNative",
          "outputs": [
            {
              "internalType": "bool",
              "name": "",
              "type": "bool"
            }
          ],
          "stateMutability": "view",
          "type": "function"
        },
        {
          "inputs": [],
          "name": "membershipToken",
          "outputs": [
            {
              "internalType": "address",
              "name": "",
              "type": "address"
            }
          ],
          "stateMutability": "view",
          "type": "function"
        },
        {
          "inputs": [],
          "name": "owner",
          "outputs": [
            {
              "internalType": "address",
              "name": "",
              "type": "address"
            }
          ],
          "stateMutability": "view",
          "type": "function"
        },
        {
          "inputs": [],
          "name": "pause",
          "outputs": [],
          "stateMutability": "nonpayable",
          "type": "function"
        },
        {
          "inputs": [],
          "name": "paused",
          "outputs": [
            {
              "internalType": "bool",
              "name": "",
              "type": "bool"
            }
          ],
          "stateMutability": "view",
          "type": "function"
        },
        {
          "inputs": [
            {
              "internalType": "address",
              "name": "_pool",
              "type": "address"
            },
            {
              "internalType": "uint256",
              "name": "_amount",
              "type": "uint256"
            },
            {
              "internalType": "string",
              "name": "_receiver",
              "type": "string"
            }
          ],
          "name": "payRewardAndSetNativeAddressForPool",
          "outputs": [],
          "stateMutability": "nonpayable",
          "type": "function"
        },
        {
          "inputs": [
            {
              "internalType": "address",
              "name": "_pool",
              "type": "address"
            },
            {
              "internalType": "uint256",
              "name": "_amount",
              "type": "uint256"
            }
          ],
          "name": "payRewardPool",
          "outputs": [],
          "stateMutability": "nonpayable",
          "type": "function"
        },
        {
          "inputs": [],
          "name": "renounceOwnership",
          "outputs": [],
          "stateMutability": "nonpayable",
          "type": "function"
        },
        {
          "inputs": [
            {
              "internalType": "address",
              "name": "_factory",
              "type": "address"
            }
          ],
          "name": "setFactory",
          "outputs": [],
          "stateMutability": "nonpayable",
          "type": "function"
        },
        {
          "inputs": [
            {
              "internalType": "address",
              "name": "_newToken",
              "type": "address"
            }
          ],
          "name": "setMembershipToken",
          "outputs": [],
          "stateMutability": "nonpayable",
          "type": "function"
        },
        {
          "inputs": [
            {
              "internalType": "address",
              "name": "_pool",
              "type": "address"
            },
            {
              "internalType": "string",
              "name": "_receiver",
              "type": "string"
            }
          ],
          "name": "setNativeAddressForPool",
          "outputs": [],
          "stateMutability": "nonpayable",
          "type": "function"
        },
        {
          "inputs": [
            {
              "internalType": "address",
              "name": "_staking",
              "type": "address"
            }
          ],
          "name": "setStaking",
          "outputs": [],
          "stateMutability": "nonpayable",
          "type": "function"
        },
        {
          "inputs": [],
          "name": "staking",
          "outputs": [
            {
              "internalType": "contract IUZV1Staking",
              "name": "",
              "type": "address"
            }
          ],
          "stateMutability": "view",
          "type": "function"
        },
        {
          "inputs": [
            {
              "internalType": "address",
              "name": "newOwner",
              "type": "address"
            }
          ],
          "name": "transferOwnership",
          "outputs": [],
          "stateMutability": "nonpayable",
          "type": "function"
        },
        {
          "inputs": [],
          "name": "unPause",
          "outputs": [],
          "stateMutability": "nonpayable",
          "type": "function"
        }
      ],
      polygonABI: [
        {
          "anonymous": false,
          "inputs": [
            {
              "indexed": false,
              "internalType": "address",
              "name": "_newTokenAddress",
              "type": "address"
            }
          ],
          "name": "MembershipTokenUpdated",
          "type": "event"
        },
        {
          "anonymous": false,
          "inputs": [
            {
              "indexed": true,
              "internalType": "address",
              "name": "previousOwner",
              "type": "address"
            },
            {
              "indexed": true,
              "internalType": "address",
              "name": "newOwner",
              "type": "address"
            }
          ],
          "name": "OwnershipTransferred",
          "type": "event"
        },
        {
          "anonymous": false,
          "inputs": [
            {
              "indexed": false,
              "internalType": "address",
              "name": "account",
              "type": "address"
            }
          ],
          "name": "Paused",
          "type": "event"
        },
        {
          "anonymous": false,
          "inputs": [
            {
              "indexed": false,
              "internalType": "address",
              "name": "token",
              "type": "address"
            },
            {
              "indexed": false,
              "internalType": "uint256",
              "name": "amount",
              "type": "uint256"
            }
          ],
          "name": "Recovered",
          "type": "event"
        },
        {
          "anonymous": false,
          "inputs": [
            {
              "indexed": true,
              "internalType": "address",
              "name": "rewardsToken",
              "type": "address"
            },
            {
              "indexed": false,
              "internalType": "uint256",
              "name": "reward",
              "type": "uint256"
            }
          ],
          "name": "RewardAdded",
          "type": "event"
        },
        {
          "anonymous": false,
          "inputs": [
            {
              "indexed": true,
              "internalType": "address",
              "name": "user",
              "type": "address"
            },
            {
              "indexed": true,
              "internalType": "address",
              "name": "rewardsToken",
              "type": "address"
            },
            {
              "indexed": false,
              "internalType": "uint256",
              "name": "reward",
              "type": "uint256"
            }
          ],
          "name": "RewardPaid",
          "type": "event"
        },
        {
          "anonymous": false,
          "inputs": [
            {
              "indexed": false,
              "internalType": "address",
              "name": "token",
              "type": "address"
            },
            {
              "indexed": false,
              "internalType": "uint256",
              "name": "newDuration",
              "type": "uint256"
            }
          ],
          "name": "RewardsDurationUpdated",
          "type": "event"
        },
        {
          "anonymous": false,
          "inputs": [
            {
              "indexed": true,
              "internalType": "address",
              "name": "user",
              "type": "address"
            },
            {
              "indexed": true,
              "internalType": "address",
              "name": "token",
              "type": "address"
            },
            {
              "indexed": false,
              "internalType": "uint256",
              "name": "amount",
              "type": "uint256"
            }
          ],
          "name": "Staked",
          "type": "event"
        },
        {
          "anonymous": false,
          "inputs": [
            {
              "indexed": false,
              "internalType": "address",
              "name": "account",
              "type": "address"
            }
          ],
          "name": "Unpaused",
          "type": "event"
        },
        {
          "anonymous": false,
          "inputs": [
            {
              "indexed": true,
              "internalType": "address",
              "name": "user",
              "type": "address"
            },
            {
              "indexed": true,
              "internalType": "address",
              "name": "token",
              "type": "address"
            },
            {
              "indexed": false,
              "internalType": "uint256",
              "name": "amount",
              "type": "uint256"
            }
          ],
          "name": "Withdrawn",
          "type": "event"
        },
        {
          "inputs": [
            {
              "internalType": "address",
              "name": "_rewardsToken",
              "type": "address"
            },
            {
              "internalType": "uint256",
              "name": "_rewardsDuration",
              "type": "uint256"
            },
            {
              "internalType": "bool",
              "name": "_isNative",
              "type": "bool"
            },
            {
              "internalType": "bool",
              "name": "_isPurchaseable",
              "type": "bool"
            },
            {
              "internalType": "string",
              "name": "_tokenName",
              "type": "string"
            }
          ],
          "name": "addReward",
          "outputs": [],
          "stateMutability": "nonpayable",
          "type": "function"
        },
        {
          "inputs": [
            {
              "internalType": "address",
              "name": "_account",
              "type": "address"
            }
          ],
          "name": "balanceHolderTokenOf",
          "outputs": [
            {
              "internalType": "uint256",
              "name": "",
              "type": "uint256"
            }
          ],
          "stateMutability": "view",
          "type": "function"
        },
        {
          "inputs": [
            {
              "internalType": "address",
              "name": "_account",
              "type": "address"
            }
          ],
          "name": "balanceOf",
          "outputs": [
            {
              "internalType": "uint256",
              "name": "",
              "type": "uint256"
            }
          ],
          "stateMutability": "view",
          "type": "function"
        },
        {
          "inputs": [
            {
              "internalType": "address",
              "name": "_account",
              "type": "address"
            },
            {
              "internalType": "address",
              "name": "_rewardsToken",
              "type": "address"
            }
          ],
          "name": "earned",
          "outputs": [
            {
              "internalType": "uint256",
              "name": "",
              "type": "uint256"
            }
          ],
          "stateMutability": "view",
          "type": "function"
        },
        {
          "inputs": [
            {
              "internalType": "address",
              "name": "_account",
              "type": "address"
            },
            {
              "internalType": "address",
              "name": "_rewardsToken",
              "type": "address"
            }
          ],
          "name": "getReward",
          "outputs": [],
          "stateMutability": "nonpayable",
          "type": "function"
        },
        {
          "inputs": [
            {
              "internalType": "address",
              "name": "_account",
              "type": "address"
            }
          ],
          "name": "getReward",
          "outputs": [],
          "stateMutability": "nonpayable",
          "type": "function"
        },
        {
          "inputs": [
            {
              "internalType": "address",
              "name": "_rewardsToken",
              "type": "address"
            }
          ],
          "name": "getRewardForDuration",
          "outputs": [
            {
              "internalType": "uint256",
              "name": "",
              "type": "uint256"
            }
          ],
          "stateMutability": "view",
          "type": "function"
        },
        {
          "inputs": [
            {
              "internalType": "address",
              "name": "_rewardsToken",
              "type": "address"
            }
          ],
          "name": "getRewardTokenState",
          "outputs": [
            {
              "internalType": "enum SharedDataTypes.PoolState",
              "name": "",
              "type": "uint8"
            }
          ],
          "stateMutability": "view",
          "type": "function"
        },
        {
          "inputs": [],
          "name": "getRewardTokens",
          "outputs": [
            {
              "internalType": "address[]",
              "name": "",
              "type": "address[]"
            }
          ],
          "stateMutability": "view",
          "type": "function"
        },
        {
          "inputs": [
            {
              "internalType": "address",
              "name": "_stakingToken",
              "type": "address"
            },
            {
              "internalType": "address",
              "name": "_accessToken",
              "type": "address"
            }
          ],
          "name": "initialize",
          "outputs": [],
          "stateMutability": "nonpayable",
          "type": "function"
        },
        {
          "inputs": [
            {
              "internalType": "address",
              "name": "_token",
              "type": "address"
            }
          ],
          "name": "initialize",
          "outputs": [],
          "stateMutability": "nonpayable",
          "type": "function"
        },
        {
          "inputs": [
            {
              "internalType": "address",
              "name": "_rewardsToken",
              "type": "address"
            }
          ],
          "name": "lastTimeRewardApplicable",
          "outputs": [
            {
              "internalType": "uint256",
              "name": "",
              "type": "uint256"
            }
          ],
          "stateMutability": "view",
          "type": "function"
        },
        {
          "inputs": [],
          "name": "membershipToken",
          "outputs": [
            {
              "internalType": "address",
              "name": "",
              "type": "address"
            }
          ],
          "stateMutability": "view",
          "type": "function"
        },
        {
          "inputs": [
            {
              "internalType": "address",
              "name": "_rewardsToken",
              "type": "address"
            },
            {
              "internalType": "uint256",
              "name": "_reward",
              "type": "uint256"
            }
          ],
          "name": "notifyRewardAmount",
          "outputs": [],
          "stateMutability": "nonpayable",
          "type": "function"
        },
        {
          "inputs": [],
          "name": "owner",
          "outputs": [
            {
              "internalType": "address",
              "name": "",
              "type": "address"
            }
          ],
          "stateMutability": "view",
          "type": "function"
        },
        {
          "inputs": [],
          "name": "pause",
          "outputs": [],
          "stateMutability": "nonpayable",
          "type": "function"
        },
        {
          "inputs": [],
          "name": "paused",
          "outputs": [
            {
              "internalType": "bool",
              "name": "",
              "type": "bool"
            }
          ],
          "stateMutability": "view",
          "type": "function"
        },
        {
          "inputs": [
            {
              "internalType": "address",
              "name": "_tokenAddress",
              "type": "address"
            },
            {
              "internalType": "uint256",
              "name": "_tokenAmount",
              "type": "uint256"
            }
          ],
          "name": "recoverERC20",
          "outputs": [],
          "stateMutability": "nonpayable",
          "type": "function"
        },
        {
          "inputs": [],
          "name": "renounceOwnership",
          "outputs": [],
          "stateMutability": "nonpayable",
          "type": "function"
        },
        {
          "inputs": [
            {
              "internalType": "address",
              "name": "",
              "type": "address"
            }
          ],
          "name": "rewardData",
          "outputs": [
            {
              "internalType": "uint256",
              "name": "rewardsDuration",
              "type": "uint256"
            },
            {
              "internalType": "uint256",
              "name": "periodStart",
              "type": "uint256"
            },
            {
              "internalType": "uint256",
              "name": "periodFinish",
              "type": "uint256"
            },
            {
              "internalType": "uint256",
              "name": "rewardRate",
              "type": "uint256"
            },
            {
              "internalType": "uint256",
              "name": "lastUpdateTime",
              "type": "uint256"
            },
            {
              "internalType": "uint256",
              "name": "rewardPerTokenStored",
              "type": "uint256"
            },
            {
              "internalType": "uint256",
              "name": "totalRewards",
              "type": "uint256"
            },
            {
              "internalType": "bool",
              "name": "isNative",
              "type": "bool"
            },
            {
              "internalType": "bool",
              "name": "isPurchaseable",
              "type": "bool"
            },
            {
              "internalType": "string",
              "name": "tokenName",
              "type": "string"
            }
          ],
          "stateMutability": "view",
          "type": "function"
        },
        {
          "inputs": [
            {
              "internalType": "address",
              "name": "_rewardsToken",
              "type": "address"
            }
          ],
          "name": "rewardPerToken",
          "outputs": [
            {
              "internalType": "uint256",
              "name": "",
              "type": "uint256"
            }
          ],
          "stateMutability": "view",
          "type": "function"
        },
        {
          "inputs": [
            {
              "internalType": "uint256",
              "name": "",
              "type": "uint256"
            }
          ],
          "name": "rewardTokens",
          "outputs": [
            {
              "internalType": "address",
              "name": "",
              "type": "address"
            }
          ],
          "stateMutability": "view",
          "type": "function"
        },
        {
          "inputs": [
            {
              "internalType": "address",
              "name": "",
              "type": "address"
            },
            {
              "internalType": "address",
              "name": "",
              "type": "address"
            }
          ],
          "name": "rewards",
          "outputs": [
            {
              "internalType": "uint256",
              "name": "",
              "type": "uint256"
            }
          ],
          "stateMutability": "view",
          "type": "function"
        },
        {
          "inputs": [
            {
              "internalType": "address",
              "name": "",
              "type": "address"
            },
            {
              "internalType": "address",
              "name": "",
              "type": "address"
            }
          ],
          "name": "savedRewards",
          "outputs": [
            {
              "internalType": "uint256",
              "name": "",
              "type": "uint256"
            }
          ],
          "stateMutability": "view",
          "type": "function"
        },
        {
          "inputs": [
            {
              "internalType": "address",
              "name": "_newToken",
              "type": "address"
            }
          ],
          "name": "setMembershipToken",
          "outputs": [],
          "stateMutability": "nonpayable",
          "type": "function"
        },
        {
          "inputs": [
            {
              "internalType": "address",
              "name": "_rewardsToken",
              "type": "address"
            },
            {
              "internalType": "uint256",
              "name": "_rewardsDuration",
              "type": "uint256"
            }
          ],
          "name": "setRewardsDuration",
          "outputs": [],
          "stateMutability": "nonpayable",
          "type": "function"
        },
        {
          "inputs": [
            {
              "internalType": "address",
              "name": "_newRouter",
              "type": "address"
            }
          ],
          "name": "setRouter",
          "outputs": [],
          "stateMutability": "nonpayable",
          "type": "function"
        },
        {
          "inputs": [
            {
              "internalType": "address",
              "name": "_stakingHolderToken",
              "type": "address"
            }
          ],
          "name": "setStakingHolderToken",
          "outputs": [],
          "stateMutability": "nonpayable",
          "type": "function"
        },
        {
          "inputs": [
            {
              "internalType": "address",
              "name": "_rewardsToken",
              "type": "address"
            },
            {
              "internalType": "string",
              "name": "_tokenName",
              "type": "string"
            }
          ],
          "name": "setTokenName",
          "outputs": [],
          "stateMutability": "nonpayable",
          "type": "function"
        },
        {
          "inputs": [
            {
              "internalType": "address",
              "name": "_token",
              "type": "address"
            },
            {
              "internalType": "uint256",
              "name": "_amount",
              "type": "uint256"
            }
          ],
          "name": "stake",
          "outputs": [],
          "stateMutability": "nonpayable",
          "type": "function"
        },
        {
          "inputs": [],
          "name": "stakingHolderToken",
          "outputs": [
            {
              "internalType": "contract IERC20",
              "name": "",
              "type": "address"
            }
          ],
          "stateMutability": "view",
          "type": "function"
        },
        {
          "inputs": [],
          "name": "stakingToken",
          "outputs": [
            {
              "internalType": "contract IERC20",
              "name": "",
              "type": "address"
            }
          ],
          "stateMutability": "view",
          "type": "function"
        },
        {
          "inputs": [],
          "name": "totalHolderTokenSupply",
          "outputs": [
            {
              "internalType": "uint256",
              "name": "",
              "type": "uint256"
            }
          ],
          "stateMutability": "view",
          "type": "function"
        },
        {
          "inputs": [],
          "name": "totalSupply",
          "outputs": [
            {
              "internalType": "uint256",
              "name": "",
              "type": "uint256"
            }
          ],
          "stateMutability": "view",
          "type": "function"
        },
        {
          "inputs": [
            {
              "internalType": "address",
              "name": "newOwner",
              "type": "address"
            }
          ],
          "name": "transferOwnership",
          "outputs": [],
          "stateMutability": "nonpayable",
          "type": "function"
        },
        {
          "inputs": [],
          "name": "unPause",
          "outputs": [],
          "stateMutability": "nonpayable",
          "type": "function"
        },
        {
          "inputs": [
            {
              "internalType": "address",
              "name": "",
              "type": "address"
            },
            {
              "internalType": "address",
              "name": "",
              "type": "address"
            }
          ],
          "name": "userRewardPerTokenPaid",
          "outputs": [
            {
              "internalType": "uint256",
              "name": "",
              "type": "uint256"
            }
          ],
          "stateMutability": "view",
          "type": "function"
        },
        {
          "inputs": [
            {
              "internalType": "address",
              "name": "_token",
              "type": "address"
            },
            {
              "internalType": "uint256",
              "name": "_amount",
              "type": "uint256"
            }
          ],
          "name": "withdraw",
          "outputs": [],
          "stateMutability": "nonpayable",
          "type": "function"
        }
      ]
  }
  