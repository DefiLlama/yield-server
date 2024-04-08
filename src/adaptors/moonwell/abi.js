module.exports = {
  VIEWS_ABI: [
    {
      "type": "function",
      "name": "comptroller",
      "inputs": [],
      "outputs": [
        {
          "name": "",
          "type": "address",
          "internalType": "contract Comptroller"
        }
      ],
      "stateMutability": "view"
    },
    {
      "type": "function",
      "name": "getAllMarketsInfo",
      "inputs": [],
      "outputs": [
        {
          "name": "",
          "type": "tuple[]",
          "internalType": "struct BaseMoonwellViews.Market[]",
          "components": [
            {
              "name": "market",
              "type": "address",
              "internalType": "address"
            },
            {
              "name": "isListed",
              "type": "bool",
              "internalType": "bool"
            },
            {
              "name": "borrowCap",
              "type": "uint256",
              "internalType": "uint256"
            },
            {
              "name": "supplyCap",
              "type": "uint256",
              "internalType": "uint256"
            },
            {
              "name": "mintPaused",
              "type": "bool",
              "internalType": "bool"
            },
            {
              "name": "borrowPaused",
              "type": "bool",
              "internalType": "bool"
            },
            {
              "name": "collateralFactor",
              "type": "uint256",
              "internalType": "uint256"
            },
            {
              "name": "underlyingPrice",
              "type": "uint256",
              "internalType": "uint256"
            },
            {
              "name": "totalSupply",
              "type": "uint256",
              "internalType": "uint256"
            },
            {
              "name": "totalBorrows",
              "type": "uint256",
              "internalType": "uint256"
            },
            {
              "name": "totalReserves",
              "type": "uint256",
              "internalType": "uint256"
            },
            {
              "name": "cash",
              "type": "uint256",
              "internalType": "uint256"
            },
            {
              "name": "exchangeRate",
              "type": "uint256",
              "internalType": "uint256"
            },
            {
              "name": "borrowIndex",
              "type": "uint256",
              "internalType": "uint256"
            },
            {
              "name": "reserveFactor",
              "type": "uint256",
              "internalType": "uint256"
            },
            {
              "name": "borrowRate",
              "type": "uint256",
              "internalType": "uint256"
            },
            {
              "name": "supplyRate",
              "type": "uint256",
              "internalType": "uint256"
            },
            {
              "name": "incentives",
              "type": "tuple[]",
              "internalType": "struct BaseMoonwellViews.MarketIncentives[]",
              "components": [
                {
                  "name": "token",
                  "type": "address",
                  "internalType": "address"
                },
                {
                  "name": "supplyIncentivesPerSec",
                  "type": "uint256",
                  "internalType": "uint256"
                },
                {
                  "name": "borrowIncentivesPerSec",
                  "type": "uint256",
                  "internalType": "uint256"
                }
              ]
            }
          ]
        }
      ],
      "stateMutability": "view"
    },
    {
      "type": "function",
      "name": "getGovernanceTokenPrice",
      "inputs": [],
      "outputs": [
        {
          "name": "_result",
          "type": "uint256",
          "internalType": "uint256"
        }
      ],
      "stateMutability": "view"
    },
    {
      "type": "function",
      "name": "getMarketIncentives",
      "inputs": [
        {
          "name": "market",
          "type": "address",
          "internalType": "contract MToken"
        }
      ],
      "outputs": [
        {
          "name": "",
          "type": "tuple[]",
          "internalType": "struct BaseMoonwellViews.MarketIncentives[]",
          "components": [
            {
              "name": "token",
              "type": "address",
              "internalType": "address"
            },
            {
              "name": "supplyIncentivesPerSec",
              "type": "uint256",
              "internalType": "uint256"
            },
            {
              "name": "borrowIncentivesPerSec",
              "type": "uint256",
              "internalType": "uint256"
            }
          ]
        }
      ],
      "stateMutability": "view"
    },
    {
      "type": "function",
      "name": "getMarketInfo",
      "inputs": [
        {
          "name": "_mToken",
          "type": "address",
          "internalType": "contract MToken"
        }
      ],
      "outputs": [
        {
          "name": "",
          "type": "tuple",
          "internalType": "struct BaseMoonwellViews.Market",
          "components": [
            {
              "name": "market",
              "type": "address",
              "internalType": "address"
            },
            {
              "name": "isListed",
              "type": "bool",
              "internalType": "bool"
            },
            {
              "name": "borrowCap",
              "type": "uint256",
              "internalType": "uint256"
            },
            {
              "name": "supplyCap",
              "type": "uint256",
              "internalType": "uint256"
            },
            {
              "name": "mintPaused",
              "type": "bool",
              "internalType": "bool"
            },
            {
              "name": "borrowPaused",
              "type": "bool",
              "internalType": "bool"
            },
            {
              "name": "collateralFactor",
              "type": "uint256",
              "internalType": "uint256"
            },
            {
              "name": "underlyingPrice",
              "type": "uint256",
              "internalType": "uint256"
            },
            {
              "name": "totalSupply",
              "type": "uint256",
              "internalType": "uint256"
            },
            {
              "name": "totalBorrows",
              "type": "uint256",
              "internalType": "uint256"
            },
            {
              "name": "totalReserves",
              "type": "uint256",
              "internalType": "uint256"
            },
            {
              "name": "cash",
              "type": "uint256",
              "internalType": "uint256"
            },
            {
              "name": "exchangeRate",
              "type": "uint256",
              "internalType": "uint256"
            },
            {
              "name": "borrowIndex",
              "type": "uint256",
              "internalType": "uint256"
            },
            {
              "name": "reserveFactor",
              "type": "uint256",
              "internalType": "uint256"
            },
            {
              "name": "borrowRate",
              "type": "uint256",
              "internalType": "uint256"
            },
            {
              "name": "supplyRate",
              "type": "uint256",
              "internalType": "uint256"
            },
            {
              "name": "incentives",
              "type": "tuple[]",
              "internalType": "struct BaseMoonwellViews.MarketIncentives[]",
              "components": [
                {
                  "name": "token",
                  "type": "address",
                  "internalType": "address"
                },
                {
                  "name": "supplyIncentivesPerSec",
                  "type": "uint256",
                  "internalType": "uint256"
                },
                {
                  "name": "borrowIncentivesPerSec",
                  "type": "uint256",
                  "internalType": "uint256"
                }
              ]
            }
          ]
        }
      ],
      "stateMutability": "view"
    },
    {
      "type": "function",
      "name": "getMarketsInfo",
      "inputs": [
        {
          "name": "_mTokens",
          "type": "address[]",
          "internalType": "contract MToken[]"
        }
      ],
      "outputs": [
        {
          "name": "",
          "type": "tuple[]",
          "internalType": "struct BaseMoonwellViews.Market[]",
          "components": [
            {
              "name": "market",
              "type": "address",
              "internalType": "address"
            },
            {
              "name": "isListed",
              "type": "bool",
              "internalType": "bool"
            },
            {
              "name": "borrowCap",
              "type": "uint256",
              "internalType": "uint256"
            },
            {
              "name": "supplyCap",
              "type": "uint256",
              "internalType": "uint256"
            },
            {
              "name": "mintPaused",
              "type": "bool",
              "internalType": "bool"
            },
            {
              "name": "borrowPaused",
              "type": "bool",
              "internalType": "bool"
            },
            {
              "name": "collateralFactor",
              "type": "uint256",
              "internalType": "uint256"
            },
            {
              "name": "underlyingPrice",
              "type": "uint256",
              "internalType": "uint256"
            },
            {
              "name": "totalSupply",
              "type": "uint256",
              "internalType": "uint256"
            },
            {
              "name": "totalBorrows",
              "type": "uint256",
              "internalType": "uint256"
            },
            {
              "name": "totalReserves",
              "type": "uint256",
              "internalType": "uint256"
            },
            {
              "name": "cash",
              "type": "uint256",
              "internalType": "uint256"
            },
            {
              "name": "exchangeRate",
              "type": "uint256",
              "internalType": "uint256"
            },
            {
              "name": "borrowIndex",
              "type": "uint256",
              "internalType": "uint256"
            },
            {
              "name": "reserveFactor",
              "type": "uint256",
              "internalType": "uint256"
            },
            {
              "name": "borrowRate",
              "type": "uint256",
              "internalType": "uint256"
            },
            {
              "name": "supplyRate",
              "type": "uint256",
              "internalType": "uint256"
            },
            {
              "name": "incentives",
              "type": "tuple[]",
              "internalType": "struct BaseMoonwellViews.MarketIncentives[]",
              "components": [
                {
                  "name": "token",
                  "type": "address",
                  "internalType": "address"
                },
                {
                  "name": "supplyIncentivesPerSec",
                  "type": "uint256",
                  "internalType": "uint256"
                },
                {
                  "name": "borrowIncentivesPerSec",
                  "type": "uint256",
                  "internalType": "uint256"
                }
              ]
            }
          ]
        }
      ],
      "stateMutability": "view"
    },
    {
      "type": "function",
      "name": "getNativeTokenPrice",
      "inputs": [],
      "outputs": [
        {
          "name": "_result",
          "type": "uint256",
          "internalType": "uint256"
        }
      ],
      "stateMutability": "view"
    },
    {
      "type": "function",
      "name": "getProtocolInfo",
      "inputs": [],
      "outputs": [
        {
          "name": "_result",
          "type": "tuple",
          "internalType": "struct BaseMoonwellViews.ProtocolInfo",
          "components": [
            {
              "name": "seizePaused",
              "type": "bool",
              "internalType": "bool"
            },
            {
              "name": "transferPaused",
              "type": "bool",
              "internalType": "bool"
            }
          ]
        }
      ],
      "stateMutability": "view"
    },
    {
      "type": "function",
      "name": "getStakingInfo",
      "inputs": [],
      "outputs": [
        {
          "name": "_result",
          "type": "tuple",
          "internalType": "struct BaseMoonwellViews.StakingInfo",
          "components": [
            {
              "name": "cooldown",
              "type": "uint256",
              "internalType": "uint256"
            },
            {
              "name": "unstakeWindow",
              "type": "uint256",
              "internalType": "uint256"
            },
            {
              "name": "distributionEnd",
              "type": "uint256",
              "internalType": "uint256"
            },
            {
              "name": "totalSupply",
              "type": "uint256",
              "internalType": "uint256"
            },
            {
              "name": "emissionPerSecond",
              "type": "uint256",
              "internalType": "uint256"
            },
            {
              "name": "lastUpdateTimestamp",
              "type": "uint256",
              "internalType": "uint256"
            },
            {
              "name": "index",
              "type": "uint256",
              "internalType": "uint256"
            }
          ]
        }
      ],
      "stateMutability": "view"
    },
    {
      "type": "function",
      "name": "getTokensBalances",
      "inputs": [
        {
          "name": "_tokens",
          "type": "address[]",
          "internalType": "address[]"
        },
        {
          "name": "_user",
          "type": "address",
          "internalType": "address"
        }
      ],
      "outputs": [
        {
          "name": "",
          "type": "tuple[]",
          "internalType": "struct BaseMoonwellViews.Balances[]",
          "components": [
            {
              "name": "amount",
              "type": "uint256",
              "internalType": "uint256"
            },
            {
              "name": "token",
              "type": "address",
              "internalType": "address"
            }
          ]
        }
      ],
      "stateMutability": "view"
    },
    {
      "type": "function",
      "name": "getUserBalances",
      "inputs": [
        {
          "name": "_user",
          "type": "address",
          "internalType": "address"
        }
      ],
      "outputs": [
        {
          "name": "",
          "type": "tuple[]",
          "internalType": "struct BaseMoonwellViews.Balances[]",
          "components": [
            {
              "name": "amount",
              "type": "uint256",
              "internalType": "uint256"
            },
            {
              "name": "token",
              "type": "address",
              "internalType": "address"
            }
          ]
        }
      ],
      "stateMutability": "view"
    },
    {
      "type": "function",
      "name": "getUserBorrowsBalances",
      "inputs": [
        {
          "name": "_user",
          "type": "address",
          "internalType": "address"
        }
      ],
      "outputs": [
        {
          "name": "",
          "type": "tuple[]",
          "internalType": "struct BaseMoonwellViews.Balances[]",
          "components": [
            {
              "name": "amount",
              "type": "uint256",
              "internalType": "uint256"
            },
            {
              "name": "token",
              "type": "address",
              "internalType": "address"
            }
          ]
        }
      ],
      "stateMutability": "view"
    },
    {
      "type": "function",
      "name": "getUserClaimsVotingPower",
      "inputs": [
        {
          "name": "_user",
          "type": "address",
          "internalType": "address"
        }
      ],
      "outputs": [
        {
          "name": "_result",
          "type": "tuple",
          "internalType": "struct BaseMoonwellViews.Votes",
          "components": [
            {
              "name": "delegatedVotingPower",
              "type": "uint256",
              "internalType": "uint256"
            },
            {
              "name": "votingPower",
              "type": "uint256",
              "internalType": "uint256"
            },
            {
              "name": "delegates",
              "type": "address",
              "internalType": "address"
            }
          ]
        }
      ],
      "stateMutability": "view"
    },
    {
      "type": "function",
      "name": "getUserMarketsMemberships",
      "inputs": [
        {
          "name": "_user",
          "type": "address",
          "internalType": "address"
        }
      ],
      "outputs": [
        {
          "name": "",
          "type": "tuple[]",
          "internalType": "struct BaseMoonwellViews.Memberships[]",
          "components": [
            {
              "name": "membership",
              "type": "bool",
              "internalType": "bool"
            },
            {
              "name": "token",
              "type": "address",
              "internalType": "address"
            }
          ]
        }
      ],
      "stateMutability": "view"
    },
    {
      "type": "function",
      "name": "getUserRewards",
      "inputs": [
        {
          "name": "_user",
          "type": "address",
          "internalType": "address"
        }
      ],
      "outputs": [
        {
          "name": "",
          "type": "tuple[]",
          "internalType": "struct BaseMoonwellViews.Rewards[]",
          "components": [
            {
              "name": "market",
              "type": "address",
              "internalType": "address"
            },
            {
              "name": "rewardToken",
              "type": "address",
              "internalType": "address"
            },
            {
              "name": "supplyRewardsAmount",
              "type": "uint256",
              "internalType": "uint256"
            },
            {
              "name": "borrowRewardsAmount",
              "type": "uint256",
              "internalType": "uint256"
            }
          ]
        }
      ],
      "stateMutability": "view"
    },
    {
      "type": "function",
      "name": "getUserStakingInfo",
      "inputs": [
        {
          "name": "_user",
          "type": "address",
          "internalType": "address"
        }
      ],
      "outputs": [
        {
          "name": "_result",
          "type": "tuple",
          "internalType": "struct BaseMoonwellViews.UserStakingInfo",
          "components": [
            {
              "name": "cooldown",
              "type": "uint256",
              "internalType": "uint256"
            },
            {
              "name": "pendingRewards",
              "type": "uint256",
              "internalType": "uint256"
            },
            {
              "name": "totalStaked",
              "type": "uint256",
              "internalType": "uint256"
            }
          ]
        }
      ],
      "stateMutability": "view"
    },
    {
      "type": "function",
      "name": "getUserStakingVotingPower",
      "inputs": [
        {
          "name": "_user",
          "type": "address",
          "internalType": "address"
        }
      ],
      "outputs": [
        {
          "name": "_result",
          "type": "tuple",
          "internalType": "struct BaseMoonwellViews.Votes",
          "components": [
            {
              "name": "delegatedVotingPower",
              "type": "uint256",
              "internalType": "uint256"
            },
            {
              "name": "votingPower",
              "type": "uint256",
              "internalType": "uint256"
            },
            {
              "name": "delegates",
              "type": "address",
              "internalType": "address"
            }
          ]
        }
      ],
      "stateMutability": "view"
    },
    {
      "type": "function",
      "name": "getUserTokensVotingPower",
      "inputs": [
        {
          "name": "_user",
          "type": "address",
          "internalType": "address"
        }
      ],
      "outputs": [
        {
          "name": "_result",
          "type": "tuple",
          "internalType": "struct BaseMoonwellViews.Votes",
          "components": [
            {
              "name": "delegatedVotingPower",
              "type": "uint256",
              "internalType": "uint256"
            },
            {
              "name": "votingPower",
              "type": "uint256",
              "internalType": "uint256"
            },
            {
              "name": "delegates",
              "type": "address",
              "internalType": "address"
            }
          ]
        }
      ],
      "stateMutability": "view"
    },
    {
      "type": "function",
      "name": "getUserVotingPower",
      "inputs": [
        {
          "name": "_user",
          "type": "address",
          "internalType": "address"
        }
      ],
      "outputs": [
        {
          "name": "_result",
          "type": "tuple",
          "internalType": "struct BaseMoonwellViews.UserVotes",
          "components": [
            {
              "name": "claimsVotes",
              "type": "tuple",
              "internalType": "struct BaseMoonwellViews.Votes",
              "components": [
                {
                  "name": "delegatedVotingPower",
                  "type": "uint256",
                  "internalType": "uint256"
                },
                {
                  "name": "votingPower",
                  "type": "uint256",
                  "internalType": "uint256"
                },
                {
                  "name": "delegates",
                  "type": "address",
                  "internalType": "address"
                }
              ]
            },
            {
              "name": "stakingVotes",
              "type": "tuple",
              "internalType": "struct BaseMoonwellViews.Votes",
              "components": [
                {
                  "name": "delegatedVotingPower",
                  "type": "uint256",
                  "internalType": "uint256"
                },
                {
                  "name": "votingPower",
                  "type": "uint256",
                  "internalType": "uint256"
                },
                {
                  "name": "delegates",
                  "type": "address",
                  "internalType": "address"
                }
              ]
            },
            {
              "name": "tokenVotes",
              "type": "tuple",
              "internalType": "struct BaseMoonwellViews.Votes",
              "components": [
                {
                  "name": "delegatedVotingPower",
                  "type": "uint256",
                  "internalType": "uint256"
                },
                {
                  "name": "votingPower",
                  "type": "uint256",
                  "internalType": "uint256"
                },
                {
                  "name": "delegates",
                  "type": "address",
                  "internalType": "address"
                }
              ]
            }
          ]
        }
      ],
      "stateMutability": "view"
    },
    {
      "type": "function",
      "name": "governanceToken",
      "inputs": [],
      "outputs": [
        {
          "name": "",
          "type": "address",
          "internalType": "contract Well"
        }
      ],
      "stateMutability": "view"
    },
    {
      "type": "function",
      "name": "initialize",
      "inputs": [
        {
          "name": "_comptroller",
          "type": "address",
          "internalType": "address"
        },
        {
          "name": "tokenSaleDistributor",
          "type": "address",
          "internalType": "address"
        },
        {
          "name": "safetyModule",
          "type": "address",
          "internalType": "address"
        },
        {
          "name": "_governanceToken",
          "type": "address",
          "internalType": "address"
        },
        {
          "name": "nativeMarket",
          "type": "address",
          "internalType": "address"
        },
        {
          "name": "governanceTokenLP",
          "type": "address",
          "internalType": "address"
        }
      ],
      "outputs": [],
      "stateMutability": "nonpayable"
    },
    {
      "type": "event",
      "name": "Initialized",
      "inputs": [
        {
          "name": "version",
          "type": "uint8",
          "indexed": false,
          "internalType": "uint8"
        }
      ],
      "anonymous": false
    }
  ],
  MRD_ABI: [
    { inputs: [], stateMutability: 'nonpayable', type: 'constructor' },
    {
      anonymous: false,
      inputs: [
        {
          indexed: true,
          internalType: 'contract MToken',
          name: 'mToken',
          type: 'address'
        },
        {
          indexed: true,
          internalType: 'address',
          name: 'borrower',
          type: 'address'
        },
        {
          indexed: true,
          internalType: 'address',
          name: 'emissionToken',
          type: 'address'
        },
        {
          indexed: false,
          internalType: 'uint256',
          name: 'totalAccrued',
          type: 'uint256'
        }
      ],
      name: 'DisbursedBorrowerRewards',
      type: 'event'
    },
    {
      anonymous: false,
      inputs: [
        {
          indexed: true,
          internalType: 'contract MToken',
          name: 'mToken',
          type: 'address'
        },
        {
          indexed: true,
          internalType: 'address',
          name: 'supplier',
          type: 'address'
        },
        {
          indexed: true,
          internalType: 'address',
          name: 'emissionToken',
          type: 'address'
        },
        {
          indexed: false,
          internalType: 'uint256',
          name: 'totalAccrued',
          type: 'uint256'
        }
      ],
      name: 'DisbursedSupplierRewards',
      type: 'event'
    },
    {
      anonymous: false,
      inputs: [
        {
          indexed: false,
          internalType: 'address',
          name: 'token',
          type: 'address'
        },
        {
          indexed: false,
          internalType: 'uint256',
          name: 'amount',
          type: 'uint256'
        }
      ],
      name: 'FundsRescued',
      type: 'event'
    },
    {
      anonymous: false,
      inputs: [
        {
          indexed: false,
          internalType: 'contract MToken',
          name: 'mToken',
          type: 'address'
        },
        {
          indexed: false,
          internalType: 'address',
          name: 'emissionToken',
          type: 'address'
        },
        {
          indexed: false,
          internalType: 'uint256',
          name: 'newIndex',
          type: 'uint256'
        },
        {
          indexed: false,
          internalType: 'uint32',
          name: 'newTimestamp',
          type: 'uint32'
        }
      ],
      name: 'GlobalBorrowIndexUpdated',
      type: 'event'
    },
    {
      anonymous: false,
      inputs: [
        {
          indexed: false,
          internalType: 'contract MToken',
          name: 'mToken',
          type: 'address'
        },
        {
          indexed: false,
          internalType: 'address',
          name: 'emissionToken',
          type: 'address'
        },
        {
          indexed: false,
          internalType: 'uint256',
          name: 'newSupplyIndex',
          type: 'uint256'
        },
        {
          indexed: false,
          internalType: 'uint32',
          name: 'newSupplyGlobalTimestamp',
          type: 'uint32'
        }
      ],
      name: 'GlobalSupplyIndexUpdated',
      type: 'event'
    },
    {
      anonymous: false,
      inputs: [
        {
          indexed: false,
          internalType: 'uint8',
          name: 'version',
          type: 'uint8'
        }
      ],
      name: 'Initialized',
      type: 'event'
    },
    {
      anonymous: false,
      inputs: [
        {
          indexed: false,
          internalType: 'address payable',
          name: 'user',
          type: 'address'
        },
        {
          indexed: false,
          internalType: 'address',
          name: 'rewardToken',
          type: 'address'
        },
        {
          indexed: false,
          internalType: 'uint256',
          name: 'amount',
          type: 'uint256'
        }
      ],
      name: 'InsufficientTokensToEmit',
      type: 'event'
    },
    {
      anonymous: false,
      inputs: [
        {
          indexed: true,
          internalType: 'contract MToken',
          name: 'mToken',
          type: 'address'
        },
        {
          indexed: true,
          internalType: 'address',
          name: 'emissionToken',
          type: 'address'
        },
        {
          indexed: false,
          internalType: 'uint256',
          name: 'oldRewardSpeed',
          type: 'uint256'
        },
        {
          indexed: false,
          internalType: 'uint256',
          name: 'newRewardSpeed',
          type: 'uint256'
        }
      ],
      name: 'NewBorrowRewardSpeed',
      type: 'event'
    },
    {
      anonymous: false,
      inputs: [
        {
          indexed: true,
          internalType: 'contract MToken',
          name: 'mToken',
          type: 'address'
        },
        {
          indexed: true,
          internalType: 'address',
          name: 'owner',
          type: 'address'
        },
        {
          indexed: true,
          internalType: 'address',
          name: 'emissionToken',
          type: 'address'
        },
        {
          indexed: false,
          internalType: 'uint256',
          name: 'supplySpeed',
          type: 'uint256'
        },
        {
          indexed: false,
          internalType: 'uint256',
          name: 'borrowSpeed',
          type: 'uint256'
        },
        {
          indexed: false,
          internalType: 'uint256',
          name: 'endTime',
          type: 'uint256'
        }
      ],
      name: 'NewConfigCreated',
      type: 'event'
    },
    {
      anonymous: false,
      inputs: [
        {
          indexed: false,
          internalType: 'uint256',
          name: 'oldEmissionCap',
          type: 'uint256'
        },
        {
          indexed: false,
          internalType: 'uint256',
          name: 'newEmissionCap',
          type: 'uint256'
        }
      ],
      name: 'NewEmissionCap',
      type: 'event'
    },
    {
      anonymous: false,
      inputs: [
        {
          indexed: true,
          internalType: 'contract MToken',
          name: 'mToken',
          type: 'address'
        },
        {
          indexed: true,
          internalType: 'address',
          name: 'emissionToken',
          type: 'address'
        },
        {
          indexed: false,
          internalType: 'address',
          name: 'currentOwner',
          type: 'address'
        },
        {
          indexed: false,
          internalType: 'address',
          name: 'newOwner',
          type: 'address'
        }
      ],
      name: 'NewEmissionConfigOwner',
      type: 'event'
    },
    {
      anonymous: false,
      inputs: [
        {
          indexed: false,
          internalType: 'address',
          name: 'oldPauseGuardian',
          type: 'address'
        },
        {
          indexed: false,
          internalType: 'address',
          name: 'newPauseGuardian',
          type: 'address'
        }
      ],
      name: 'NewPauseGuardian',
      type: 'event'
    },
    {
      anonymous: false,
      inputs: [
        {
          indexed: true,
          internalType: 'contract MToken',
          name: 'mToken',
          type: 'address'
        },
        {
          indexed: true,
          internalType: 'address',
          name: 'emissionToken',
          type: 'address'
        },
        {
          indexed: false,
          internalType: 'uint256',
          name: 'currentEndTime',
          type: 'uint256'
        },
        {
          indexed: false,
          internalType: 'uint256',
          name: 'newEndTime',
          type: 'uint256'
        }
      ],
      name: 'NewRewardEndTime',
      type: 'event'
    },
    {
      anonymous: false,
      inputs: [
        {
          indexed: true,
          internalType: 'contract MToken',
          name: 'mToken',
          type: 'address'
        },
        {
          indexed: true,
          internalType: 'address',
          name: 'emissionToken',
          type: 'address'
        },
        {
          indexed: false,
          internalType: 'uint256',
          name: 'oldRewardSpeed',
          type: 'uint256'
        },
        {
          indexed: false,
          internalType: 'uint256',
          name: 'newRewardSpeed',
          type: 'uint256'
        }
      ],
      name: 'NewSupplyRewardSpeed',
      type: 'event'
    },
    {
      anonymous: false,
      inputs: [
        {
          indexed: false,
          internalType: 'address',
          name: 'account',
          type: 'address'
        }
      ],
      name: 'Paused',
      type: 'event'
    },
    { anonymous: false, inputs: [], name: 'RewardsPaused', type: 'event' },
    { anonymous: false, inputs: [], name: 'RewardsUnpaused', type: 'event' },
    {
      anonymous: false,
      inputs: [
        {
          indexed: false,
          internalType: 'address',
          name: 'account',
          type: 'address'
        }
      ],
      name: 'Unpaused',
      type: 'event'
    },
    {
      inputs: [
        { internalType: 'contract MToken', name: '_mToken', type: 'address' },
        { internalType: 'address', name: '_owner', type: 'address' },
        { internalType: 'address', name: '_emissionToken', type: 'address' },
        {
          internalType: 'uint256',
          name: '_supplyEmissionPerSec',
          type: 'uint256'
        },
        {
          internalType: 'uint256',
          name: '_borrowEmissionsPerSec',
          type: 'uint256'
        },
        { internalType: 'uint256', name: '_endTime', type: 'uint256' }
      ],
      name: '_addEmissionConfig',
      outputs: [],
      stateMutability: 'nonpayable',
      type: 'function'
    },
    {
      inputs: [],
      name: '_pauseRewards',
      outputs: [],
      stateMutability: 'nonpayable',
      type: 'function'
    },
    {
      inputs: [
        { internalType: 'address', name: '_tokenAddress', type: 'address' },
        { internalType: 'uint256', name: '_amount', type: 'uint256' }
      ],
      name: '_rescueFunds',
      outputs: [],
      stateMutability: 'nonpayable',
      type: 'function'
    },
    {
      inputs: [
        { internalType: 'uint256', name: '_newEmissionCap', type: 'uint256' }
      ],
      name: '_setEmissionCap',
      outputs: [],
      stateMutability: 'nonpayable',
      type: 'function'
    },
    {
      inputs: [
        { internalType: 'address', name: '_newPauseGuardian', type: 'address' }
      ],
      name: '_setPauseGuardian',
      outputs: [],
      stateMutability: 'nonpayable',
      type: 'function'
    },
    {
      inputs: [],
      name: '_unpauseRewards',
      outputs: [],
      stateMutability: 'nonpayable',
      type: 'function'
    },
    {
      inputs: [
        { internalType: 'contract MToken', name: '_mToken', type: 'address' },
        { internalType: 'address', name: '_emissionToken', type: 'address' },
        { internalType: 'uint256', name: '_newBorrowSpeed', type: 'uint256' }
      ],
      name: '_updateBorrowSpeed',
      outputs: [],
      stateMutability: 'nonpayable',
      type: 'function'
    },
    {
      inputs: [
        { internalType: 'contract MToken', name: '_mToken', type: 'address' },
        { internalType: 'address', name: '_emissionToken', type: 'address' },
        { internalType: 'uint256', name: '_newEndTime', type: 'uint256' }
      ],
      name: '_updateEndTime',
      outputs: [],
      stateMutability: 'nonpayable',
      type: 'function'
    },
    {
      inputs: [
        { internalType: 'contract MToken', name: '_mToken', type: 'address' },
        { internalType: 'address', name: '_emissionToken', type: 'address' },
        { internalType: 'address', name: '_newOwner', type: 'address' }
      ],
      name: '_updateOwner',
      outputs: [],
      stateMutability: 'nonpayable',
      type: 'function'
    },
    {
      inputs: [
        { internalType: 'contract MToken', name: '_mToken', type: 'address' },
        { internalType: 'address', name: '_emissionToken', type: 'address' },
        { internalType: 'uint256', name: '_newSupplySpeed', type: 'uint256' }
      ],
      name: '_updateSupplySpeed',
      outputs: [],
      stateMutability: 'nonpayable',
      type: 'function'
    },
    {
      inputs: [],
      name: 'comptroller',
      outputs: [
        { internalType: 'contract Comptroller', name: '', type: 'address' }
      ],
      stateMutability: 'view',
      type: 'function'
    },
    {
      inputs: [
        { internalType: 'contract MToken', name: '_mToken', type: 'address' },
        { internalType: 'address', name: '_borrower', type: 'address' },
        { internalType: 'bool', name: '_sendTokens', type: 'bool' }
      ],
      name: 'disburseBorrowerRewards',
      outputs: [],
      stateMutability: 'nonpayable',
      type: 'function'
    },
    {
      inputs: [
        { internalType: 'contract MToken', name: '_mToken', type: 'address' },
        { internalType: 'address', name: '_supplier', type: 'address' },
        { internalType: 'bool', name: '_sendTokens', type: 'bool' }
      ],
      name: 'disburseSupplierRewards',
      outputs: [],
      stateMutability: 'nonpayable',
      type: 'function'
    },
    {
      inputs: [],
      name: 'emissionCap',
      outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
      stateMutability: 'view',
      type: 'function'
    },
    {
      inputs: [
        { internalType: 'contract MToken', name: '_mToken', type: 'address' }
      ],
      name: 'getAllMarketConfigs',
      outputs: [
        {
          components: [
            { internalType: 'address', name: 'owner', type: 'address' },
            { internalType: 'address', name: 'emissionToken', type: 'address' },
            { internalType: 'uint256', name: 'endTime', type: 'uint256' },
            {
              internalType: 'uint224',
              name: 'supplyGlobalIndex',
              type: 'uint224'
            },
            {
              internalType: 'uint32',
              name: 'supplyGlobalTimestamp',
              type: 'uint32'
            },
            {
              internalType: 'uint224',
              name: 'borrowGlobalIndex',
              type: 'uint224'
            },
            {
              internalType: 'uint32',
              name: 'borrowGlobalTimestamp',
              type: 'uint32'
            },
            {
              internalType: 'uint256',
              name: 'supplyEmissionsPerSec',
              type: 'uint256'
            },
            {
              internalType: 'uint256',
              name: 'borrowEmissionsPerSec',
              type: 'uint256'
            }
          ],
          internalType: 'struct MultiRewardDistributorCommon.MarketConfig[]',
          name: '',
          type: 'tuple[]'
        }
      ],
      stateMutability: 'view',
      type: 'function'
    },
    {
      inputs: [
        { internalType: 'contract MToken', name: '_mToken', type: 'address' },
        { internalType: 'address', name: '_emissionToken', type: 'address' }
      ],
      name: 'getConfigForMarket',
      outputs: [
        {
          components: [
            { internalType: 'address', name: 'owner', type: 'address' },
            { internalType: 'address', name: 'emissionToken', type: 'address' },
            { internalType: 'uint256', name: 'endTime', type: 'uint256' },
            {
              internalType: 'uint224',
              name: 'supplyGlobalIndex',
              type: 'uint224'
            },
            {
              internalType: 'uint32',
              name: 'supplyGlobalTimestamp',
              type: 'uint32'
            },
            {
              internalType: 'uint224',
              name: 'borrowGlobalIndex',
              type: 'uint224'
            },
            {
              internalType: 'uint32',
              name: 'borrowGlobalTimestamp',
              type: 'uint32'
            },
            {
              internalType: 'uint256',
              name: 'supplyEmissionsPerSec',
              type: 'uint256'
            },
            {
              internalType: 'uint256',
              name: 'borrowEmissionsPerSec',
              type: 'uint256'
            }
          ],
          internalType: 'struct MultiRewardDistributorCommon.MarketConfig',
          name: '',
          type: 'tuple'
        }
      ],
      stateMutability: 'view',
      type: 'function'
    },
    {
      inputs: [],
      name: 'getCurrentEmissionCap',
      outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
      stateMutability: 'view',
      type: 'function'
    },
    {
      inputs: [
        { internalType: 'contract MToken', name: '_mToken', type: 'address' },
        { internalType: 'address', name: '_emissionToken', type: 'address' }
      ],
      name: 'getCurrentOwner',
      outputs: [{ internalType: 'address', name: '', type: 'address' }],
      stateMutability: 'view',
      type: 'function'
    },
    {
      inputs: [
        { internalType: 'address', name: 'mToken', type: 'address' },
        { internalType: 'uint256', name: 'index', type: 'uint256' }
      ],
      name: 'getGlobalBorrowIndex',
      outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
      stateMutability: 'view',
      type: 'function'
    },
    {
      inputs: [
        { internalType: 'address', name: 'mToken', type: 'address' },
        { internalType: 'uint256', name: 'index', type: 'uint256' }
      ],
      name: 'getGlobalSupplyIndex',
      outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
      stateMutability: 'view',
      type: 'function'
    },
    {
      inputs: [
        { internalType: 'contract MToken', name: '_mToken', type: 'address' },
        { internalType: 'address', name: '_user', type: 'address' }
      ],
      name: 'getOutstandingRewardsForUser',
      outputs: [
        {
          components: [
            { internalType: 'address', name: 'emissionToken', type: 'address' },
            { internalType: 'uint256', name: 'totalAmount', type: 'uint256' },
            { internalType: 'uint256', name: 'supplySide', type: 'uint256' },
            { internalType: 'uint256', name: 'borrowSide', type: 'uint256' }
          ],
          internalType: 'struct MultiRewardDistributorCommon.RewardInfo[]',
          name: '',
          type: 'tuple[]'
        }
      ],
      stateMutability: 'view',
      type: 'function'
    },
    {
      inputs: [{ internalType: 'address', name: '_user', type: 'address' }],
      name: 'getOutstandingRewardsForUser',
      outputs: [
        {
          components: [
            { internalType: 'address', name: 'mToken', type: 'address' },
            {
              components: [
                {
                  internalType: 'address',
                  name: 'emissionToken',
                  type: 'address'
                },
                {
                  internalType: 'uint256',
                  name: 'totalAmount',
                  type: 'uint256'
                },
                {
                  internalType: 'uint256',
                  name: 'supplySide',
                  type: 'uint256'
                },
                { internalType: 'uint256', name: 'borrowSide', type: 'uint256' }
              ],
              internalType: 'struct MultiRewardDistributorCommon.RewardInfo[]',
              name: 'rewards',
              type: 'tuple[]'
            }
          ],
          internalType:
            'struct MultiRewardDistributorCommon.RewardWithMToken[]',
          name: '',
          type: 'tuple[]'
        }
      ],
      stateMutability: 'view',
      type: 'function'
    },
    {
      inputs: [],
      name: 'initialIndexConstant',
      outputs: [{ internalType: 'uint224', name: '', type: 'uint224' }],
      stateMutability: 'view',
      type: 'function'
    },
    {
      inputs: [
        { internalType: 'address', name: '_comptroller', type: 'address' },
        { internalType: 'address', name: '_pauseGuardian', type: 'address' }
      ],
      name: 'initialize',
      outputs: [],
      stateMutability: 'nonpayable',
      type: 'function'
    },
    {
      inputs: [
        { internalType: 'address', name: '', type: 'address' },
        { internalType: 'uint256', name: '', type: 'uint256' }
      ],
      name: 'marketConfigs',
      outputs: [
        {
          components: [
            { internalType: 'address', name: 'owner', type: 'address' },
            { internalType: 'address', name: 'emissionToken', type: 'address' },
            { internalType: 'uint256', name: 'endTime', type: 'uint256' },
            {
              internalType: 'uint224',
              name: 'supplyGlobalIndex',
              type: 'uint224'
            },
            {
              internalType: 'uint32',
              name: 'supplyGlobalTimestamp',
              type: 'uint32'
            },
            {
              internalType: 'uint224',
              name: 'borrowGlobalIndex',
              type: 'uint224'
            },
            {
              internalType: 'uint32',
              name: 'borrowGlobalTimestamp',
              type: 'uint32'
            },
            {
              internalType: 'uint256',
              name: 'supplyEmissionsPerSec',
              type: 'uint256'
            },
            {
              internalType: 'uint256',
              name: 'borrowEmissionsPerSec',
              type: 'uint256'
            }
          ],
          internalType: 'struct MultiRewardDistributorCommon.MarketConfig',
          name: 'config',
          type: 'tuple'
        }
      ],
      stateMutability: 'view',
      type: 'function'
    },
    {
      inputs: [],
      name: 'pauseGuardian',
      outputs: [{ internalType: 'address', name: '', type: 'address' }],
      stateMutability: 'view',
      type: 'function'
    },
    {
      inputs: [],
      name: 'paused',
      outputs: [{ internalType: 'bool', name: '', type: 'bool' }],
      stateMutability: 'view',
      type: 'function'
    },
    {
      inputs: [
        { internalType: 'contract MToken', name: '_mToken', type: 'address' }
      ],
      name: 'updateMarketBorrowIndex',
      outputs: [],
      stateMutability: 'nonpayable',
      type: 'function'
    },
    {
      inputs: [
        { internalType: 'contract MToken', name: '_mToken', type: 'address' },
        { internalType: 'address', name: '_borrower', type: 'address' },
        { internalType: 'bool', name: '_sendTokens', type: 'bool' }
      ],
      name: 'updateMarketBorrowIndexAndDisburseBorrowerRewards',
      outputs: [],
      stateMutability: 'nonpayable',
      type: 'function'
    },
    {
      inputs: [
        { internalType: 'contract MToken', name: '_mToken', type: 'address' }
      ],
      name: 'updateMarketSupplyIndex',
      outputs: [],
      stateMutability: 'nonpayable',
      type: 'function'
    },
    {
      inputs: [
        { internalType: 'contract MToken', name: '_mToken', type: 'address' },
        { internalType: 'address', name: '_supplier', type: 'address' },
        { internalType: 'bool', name: '_sendTokens', type: 'bool' }
      ],
      name: 'updateMarketSupplyIndexAndDisburseSupplierRewards',
      outputs: [],
      stateMutability: 'nonpayable',
      type: 'function'
    }
  ]
}
