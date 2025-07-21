export const LavarageIdl = {
    "version": "0.1.0",
    "name": "lavarage",
    "instructions": [
      {
        "name": "lpOperatorCreateTradingPool",
        "accounts": [
          {
            "name": "tradingPool",
            "isMut": true,
            "isSigner": false
          },
          {
            "name": "operator",
            "isMut": true,
            "isSigner": true
          },
          {
            "name": "nodeWallet",
            "isMut": false,
            "isSigner": false
          },
          {
            "name": "mint",
            "isMut": false,
            "isSigner": false
          },
          {
            "name": "systemProgram",
            "isMut": false,
            "isSigner": false
          }
        ],
        "args": [
          {
            "name": "interestRate",
            "type": "u8"
          }
        ]
      },
      {
        "name": "lpOperatorCreateNodeWallet",
        "accounts": [
          {
            "name": "nodeWallet",
            "isMut": true,
            "isSigner": true
          },
          {
            "name": "operator",
            "isMut": true,
            "isSigner": true
          },
          {
            "name": "systemProgram",
            "isMut": false,
            "isSigner": false
          }
        ],
        "args": []
      },
      {
        "name": "lpOperatorFundNodeWallet",
        "accounts": [
          {
            "name": "nodeWallet",
            "isMut": true,
            "isSigner": false
          },
          {
            "name": "funder",
            "isMut": true,
            "isSigner": true
          },
          {
            "name": "systemProgram",
            "isMut": false,
            "isSigner": false
          }
        ],
        "args": [
          {
            "name": "amount",
            "type": "u64"
          }
        ]
      },
      {
        "name": "lpOperatorWithdrawFromNodeWallet",
        "accounts": [
          {
            "name": "nodeWallet",
            "isMut": true,
            "isSigner": false
          },
          {
            "name": "funder",
            "isMut": true,
            "isSigner": true
          },
          {
            "name": "systemProgram",
            "isMut": false,
            "isSigner": false
          }
        ],
        "args": [
          {
            "name": "amount",
            "type": "u64"
          }
        ]
      },
      {
        "name": "lpOperatorUpdateMaxBorrow",
        "accounts": [
          {
            "name": "tradingPool",
            "isMut": true,
            "isSigner": false
          },
          {
            "name": "nodeWallet",
            "isMut": false,
            "isSigner": false
          },
          {
            "name": "operator",
            "isMut": true,
            "isSigner": true
          },
          {
            "name": "systemProgram",
            "isMut": false,
            "isSigner": false
          }
        ],
        "args": [
          {
            "name": "amount",
            "type": "u64"
          }
        ]
      },
      {
        "name": "lpOperatorUpdateMaxExposure",
        "accounts": [
          {
            "name": "tradingPool",
            "isMut": true,
            "isSigner": false
          },
          {
            "name": "nodeWallet",
            "isMut": false,
            "isSigner": false
          },
          {
            "name": "operator",
            "isMut": true,
            "isSigner": true
          },
          {
            "name": "systemProgram",
            "isMut": false,
            "isSigner": false
          }
        ],
        "args": [
          {
            "name": "amount",
            "type": "u64"
          }
        ]
      },
      {
        "name": "lpOperatorUpdateInterestRate",
        "accounts": [
          {
            "name": "tradingPool",
            "isMut": true,
            "isSigner": false
          },
          {
            "name": "nodeWallet",
            "isMut": false,
            "isSigner": false
          },
          {
            "name": "operator",
            "isMut": true,
            "isSigner": true
          },
          {
            "name": "systemProgram",
            "isMut": false,
            "isSigner": false
          }
        ],
        "args": [
          {
            "name": "amount",
            "type": "u8"
          }
        ]
      },
      {
        "name": "lpLiquidate",
        "accounts": [
          {
            "name": "mint",
            "isMut": false,
            "isSigner": false
          },
          {
            "name": "positionAccount",
            "isMut": true,
            "isSigner": false
          },
          {
            "name": "trader",
            "isMut": true,
            "isSigner": false
          },
          {
            "name": "tradingPool",
            "isMut": true,
            "isSigner": false
          },
          {
            "name": "fromTokenAccount",
            "isMut": true,
            "isSigner": false
          },
          {
            "name": "toTokenAccount",
            "isMut": true,
            "isSigner": false
          },
          {
            "name": "nodeWallet",
            "isMut": true,
            "isSigner": false
          },
          {
            "name": "tokenProgram",
            "isMut": false,
            "isSigner": false
          },
          {
            "name": "randomAccountAsId",
            "isMut": false,
            "isSigner": false
          },
          {
            "name": "clock",
            "isMut": false,
            "isSigner": false
          },
          {
            "name": "operator",
            "isMut": false,
            "isSigner": true
          },
          {
            "name": "oracle",
            "isMut": false,
            "isSigner": true
          }
        ],
        "args": [
          {
            "name": "positionSize",
            "type": "u64"
          }
        ]
      },
      {
        "name": "lpCollectInterest",
        "accounts": [
          {
            "name": "mint",
            "isMut": false,
            "isSigner": false
          },
          {
            "name": "positionAccount",
            "isMut": true,
            "isSigner": false
          },
          {
            "name": "trader",
            "isMut": true,
            "isSigner": false
          },
          {
            "name": "tradingPool",
            "isMut": true,
            "isSigner": false
          },
          {
            "name": "fromTokenAccount",
            "isMut": true,
            "isSigner": false
          },
          {
            "name": "toTokenAccount",
            "isMut": true,
            "isSigner": false
          },
          {
            "name": "nodeWallet",
            "isMut": true,
            "isSigner": false
          },
          {
            "name": "tokenProgram",
            "isMut": false,
            "isSigner": false
          },
          {
            "name": "randomAccountAsId",
            "isMut": false,
            "isSigner": false
          },
          {
            "name": "clock",
            "isMut": false,
            "isSigner": false
          },
          {
            "name": "operator",
            "isMut": false,
            "isSigner": true
          },
          {
            "name": "oracle",
            "isMut": false,
            "isSigner": true
          }
        ],
        "args": [
          {
            "name": "price",
            "type": "u128"
          }
        ]
      },
      {
        "name": "tradingOpenBorrow",
        "accounts": [
          {
            "name": "positionAccount",
            "isMut": true,
            "isSigner": false
          },
          {
            "name": "trader",
            "isMut": true,
            "isSigner": true
          },
          {
            "name": "tradingPool",
            "isMut": true,
            "isSigner": false
          },
          {
            "name": "nodeWallet",
            "isMut": true,
            "isSigner": false
          },
          {
            "name": "instructions",
            "isMut": false,
            "isSigner": false
          },
          {
            "name": "systemProgram",
            "isMut": false,
            "isSigner": false
          },
          {
            "name": "clock",
            "isMut": false,
            "isSigner": false
          },
          {
            "name": "randomAccountAsId",
            "isMut": false,
            "isSigner": false
          },
          {
            "name": "feeReceipient",
            "isMut": true,
            "isSigner": false
          }
        ],
        "args": [
          {
            "name": "positionSize",
            "type": "u64"
          },
          {
            "name": "userPays",
            "type": "u64"
          }
        ]
      },
      {
        "name": "tradingOpenAddCollateral",
        "accounts": [
          {
            "name": "positionAccount",
            "isMut": true,
            "isSigner": false
          },
          {
            "name": "trader",
            "isMut": true,
            "isSigner": true
          },
          {
            "name": "tradingPool",
            "isMut": true,
            "isSigner": false
          },
          {
            "name": "systemProgram",
            "isMut": false,
            "isSigner": false
          },
          {
            "name": "mint",
            "isMut": false,
            "isSigner": false
          },
          {
            "name": "toTokenAccount",
            "isMut": false,
            "isSigner": false
          },
          {
            "name": "randomAccountAsId",
            "isMut": false,
            "isSigner": false
          }
        ],
        "args": [
          {
            "name": "maxInterestRate",
            "type": "u8"
          }
        ]
      },
      {
        "name": "tradingCloseBorrowCollateral",
        "accounts": [
          {
            "name": "positionAccount",
            "isMut": true,
            "isSigner": false
          },
          {
            "name": "trader",
            "isMut": true,
            "isSigner": true
          },
          {
            "name": "tradingPool",
            "isMut": true,
            "isSigner": false
          },
          {
            "name": "instructions",
            "isMut": false,
            "isSigner": false
          },
          {
            "name": "systemProgram",
            "isMut": false,
            "isSigner": false
          },
          {
            "name": "mint",
            "isMut": false,
            "isSigner": false
          },
          {
            "name": "fromTokenAccount",
            "isMut": true,
            "isSigner": false
          },
          {
            "name": "toTokenAccount",
            "isMut": true,
            "isSigner": false
          },
          {
            "name": "tokenProgram",
            "isMut": false,
            "isSigner": false
          },
          {
            "name": "clock",
            "isMut": false,
            "isSigner": false
          },
          {
            "name": "randomAccountAsId",
            "isMut": false,
            "isSigner": false
          }
        ],
        "args": []
      },
      {
        "name": "tradingDataAccruedInterest",
        "accounts": [
          {
            "name": "positionAccount",
            "isMut": true,
            "isSigner": false
          },
          {
            "name": "trader",
            "isMut": true,
            "isSigner": true
          },
          {
            "name": "tradingPool",
            "isMut": true,
            "isSigner": false
          },
          {
            "name": "nodeWallet",
            "isMut": true,
            "isSigner": false
          },
          {
            "name": "systemProgram",
            "isMut": false,
            "isSigner": false
          },
          {
            "name": "clock",
            "isMut": false,
            "isSigner": false
          },
          {
            "name": "randomAccountAsId",
            "isMut": false,
            "isSigner": false
          },
          {
            "name": "feeReceipient",
            "isMut": true,
            "isSigner": false
          }
        ],
        "args": [],
        "returns": "u64"
      },
      {
        "name": "tradingCloseRepaySol",
        "accounts": [
          {
            "name": "positionAccount",
            "isMut": true,
            "isSigner": false
          },
          {
            "name": "trader",
            "isMut": true,
            "isSigner": true
          },
          {
            "name": "tradingPool",
            "isMut": true,
            "isSigner": false
          },
          {
            "name": "nodeWallet",
            "isMut": true,
            "isSigner": false
          },
          {
            "name": "systemProgram",
            "isMut": false,
            "isSigner": false
          },
          {
            "name": "clock",
            "isMut": false,
            "isSigner": false
          },
          {
            "name": "randomAccountAsId",
            "isMut": false,
            "isSigner": false
          },
          {
            "name": "feeReceipient",
            "isMut": true,
            "isSigner": false
          }
        ],
        "args": [
          {
            "name": "closingPositionSize",
            "type": "u64"
          },
          {
            "name": "closeType",
            "type": "u64"
          }
        ]
      },
      {
        "name": "tradingClosePartialRepaySol",
        "accounts": [
          {
            "name": "positionAccount",
            "isMut": true,
            "isSigner": false
          },
          {
            "name": "trader",
            "isMut": true,
            "isSigner": true
          },
          {
            "name": "tradingPool",
            "isMut": true,
            "isSigner": false
          },
          {
            "name": "nodeWallet",
            "isMut": true,
            "isSigner": false
          },
          {
            "name": "systemProgram",
            "isMut": false,
            "isSigner": false
          },
          {
            "name": "clock",
            "isMut": false,
            "isSigner": false
          },
          {
            "name": "randomAccountAsId",
            "isMut": false,
            "isSigner": false
          },
          {
            "name": "feeReceipient",
            "isMut": true,
            "isSigner": false
          }
        ],
        "args": [
          {
            "name": "repayPercentage",
            "type": "u64"
          }
        ]
      },
      {
        "name": "syncNodeWallet",
        "accounts": [
          {
            "name": "nodeWallet",
            "isMut": true,
            "isSigner": false
          },
          {
            "name": "funder",
            "isMut": true,
            "isSigner": true
          },
          {
            "name": "systemProgram",
            "isMut": false,
            "isSigner": false
          }
        ],
        "args": []
      },
      {
        "name": "tradingCreateTpDelegate",
        "accounts": [
          {
            "name": "delegate",
            "isMut": true,
            "isSigner": false
          },
          {
            "name": "originalOperator",
            "isMut": true,
            "isSigner": true
          },
          {
            "name": "delegatedAccount",
            "isMut": false,
            "isSigner": false
          },
          {
            "name": "systemProgram",
            "isMut": false,
            "isSigner": false
          }
        ],
        "args": [
          {
            "name": "price",
            "type": "u64"
          },
          {
            "name": "lowerThreshold",
            "type": "u64"
          },
          {
            "name": "delegateOperator",
            "type": "publicKey"
          },
          {
            "name": "partialPercentage",
            "type": "u64"
          }
        ]
      },
      {
        "name": "tradingRemoveTpDelegate",
        "accounts": [
          {
            "name": "delegate",
            "isMut": true,
            "isSigner": false
          },
          {
            "name": "originalOperator",
            "isMut": true,
            "isSigner": true
          },
          {
            "name": "delegatedAccount",
            "isMut": false,
            "isSigner": false
          },
          {
            "name": "systemProgram",
            "isMut": false,
            "isSigner": false
          }
        ],
        "args": []
      }
    ],
    "accounts": [
      {
        "name": "delegate",
        "type": {
          "kind": "struct",
          "fields": [
            {
              "name": "delegateType",
              "type": "u8"
            },
            {
              "name": "field1",
              "type": "u64"
            },
            {
              "name": "field2",
              "type": "u64"
            },
            {
              "name": "field3",
              "type": "u64"
            },
            {
              "name": "field4",
              "type": "publicKey"
            },
            {
              "name": "field5",
              "type": "publicKey"
            },
            {
              "name": "originalOperator",
              "type": "publicKey"
            },
            {
              "name": "delegateOperator",
              "type": "publicKey"
            },
            {
              "name": "account",
              "type": "publicKey"
            }
          ]
        }
      },
      {
        "name": "nodeWallet",
        "type": {
          "kind": "struct",
          "fields": [
            {
              "name": "totalFunds",
              "type": "u64"
            },
            {
              "name": "totalBorrowed",
              "type": "u64"
            },
            {
              "name": "maintenanceLtv",
              "type": "u8"
            },
            {
              "name": "liquidationLtv",
              "type": "u8"
            },
            {
              "name": "nodeOperator",
              "type": "publicKey"
            }
          ]
        }
      },
      {
        "name": "pool",
        "type": {
          "kind": "struct",
          "fields": [
            {
              "name": "interestRate",
              "type": "u8"
            },
            {
              "name": "collateralType",
              "type": "publicKey"
            },
            {
              "name": "maxBorrow",
              "type": "u64"
            },
            {
              "name": "nodeWallet",
              "type": "publicKey"
            },
            {
              "name": "maxExposure",
              "type": "u64"
            },
            {
              "name": "currentExposure",
              "type": "u64"
            }
          ]
        }
      },
      {
        "name": "position",
        "type": {
          "kind": "struct",
          "fields": [
            {
              "name": "pool",
              "type": "publicKey"
            },
            {
              "name": "closeStatusRecallTimestamp",
              "type": "u64"
            },
            {
              "name": "amount",
              "type": "u64"
            },
            {
              "name": "userPaid",
              "type": "u64"
            },
            {
              "name": "collateralAmount",
              "type": "u64"
            },
            {
              "name": "timestamp",
              "type": "i64"
            },
            {
              "name": "trader",
              "type": "publicKey"
            },
            {
              "name": "seed",
              "type": "publicKey"
            },
            {
              "name": "closeTimestamp",
              "type": "i64"
            },
            {
              "name": "closingPositionSize",
              "type": "u64"
            },
            {
              "name": "interestRate",
              "type": "u8"
            },
            {
              "name": "lastInterestCollect",
              "type": "i64"
            }
          ]
        }
      }
    ],
    "types": [
      {
        "name": "LendingErrors",
        "docs": [
          "Errors for this program"
        ],
        "type": {
          "kind": "enum",
          "variants": [
            {
              "name": "AddressMismatch"
            },
            {
              "name": "ProgramMismatch"
            },
            {
              "name": "MissingRepay"
            },
            {
              "name": "IncorrectOwner"
            },
            {
              "name": "IncorrectProgramAuthority"
            },
            {
              "name": "CannotBorrowBeforeRepay"
            },
            {
              "name": "UnknownInstruction"
            },
            {
              "name": "ExpectedCollateralNotEnough"
            }
          ]
        }
      },
      {
        "name": "ErrorCode",
        "type": {
          "kind": "enum",
          "variants": [
            {
              "name": "InvalidSignature"
            },
            {
              "name": "InvalidOracle"
            }
          ]
        }
      },
      {
        "name": "ErrorCode",
        "type": {
          "kind": "enum",
          "variants": [
            {
              "name": "OnlyDelegateOperator"
            },
            {
              "name": "AddressMismatch"
            },
            {
              "name": "InvalidDelegateType"
            }
          ]
        }
      },
      {
        "name": "PositionCloseType",
        "type": {
          "kind": "enum",
          "variants": [
            {
              "name": "ClosedByUser"
            },
            {
              "name": "Liquidated"
            }
          ]
        }
      }
    ],
    "events": [
      {
        "name": "PositionCloseEvent",
        "fields": [
          {
            "name": "pool",
            "type": "publicKey",
            "index": false
          },
          {
            "name": "amount",
            "type": "u64",
            "index": false
          },
          {
            "name": "userPaid",
            "type": "u64",
            "index": false
          },
          {
            "name": "collateralAmount",
            "type": "u64",
            "index": false
          },
          {
            "name": "openTimestamp",
            "type": "i64",
            "index": false
          },
          {
            "name": "trader",
            "type": "publicKey",
            "index": false
          },
          {
            "name": "closeType",
            "type": "u8",
            "index": false
          },
          {
            "name": "closeTimestamp",
            "type": "i64",
            "index": false
          },
          {
            "name": "closingPositionSize",
            "type": "u64",
            "index": false
          }
        ]
      },
      {
        "name": "PositionOpenEvent",
        "fields": [
          {
            "name": "pool",
            "type": "publicKey",
            "index": false
          },
          {
            "name": "amount",
            "type": "u64",
            "index": false
          },
          {
            "name": "userPaid",
            "type": "u64",
            "index": false
          },
          {
            "name": "collateralAmount",
            "type": "u64",
            "index": false
          },
          {
            "name": "openTimestamp",
            "type": "i64",
            "index": false
          },
          {
            "name": "trader",
            "type": "publicKey",
            "index": false
          }
        ]
      }
    ],
    "errors": [
      {
        "code": 6000,
        "name": "AddressMismatch",
        "msg": "Address Mismatch"
      },
      {
        "code": 6001,
        "name": "ProgramMismatch",
        "msg": "Program Mismatch"
      },
      {
        "code": 6002,
        "name": "MissingRepay",
        "msg": "Missing Repay"
      },
      {
        "code": 6003,
        "name": "IncorrectOwner",
        "msg": "Incorrect Owner"
      },
      {
        "code": 6004,
        "name": "IncorrectProgramAuthority",
        "msg": "Incorrect Program Authority"
      },
      {
        "code": 6005,
        "name": "CannotBorrowBeforeRepay",
        "msg": "Cannot Borrow Before Repay"
      },
      {
        "code": 6006,
        "name": "UnknownInstruction",
        "msg": "Unknown Instruction"
      },
      {
        "code": 6007,
        "name": "ExpectedCollateralNotEnough",
        "msg": "Expected collateral not enough"
      },
      {
        "code": 6008,
        "name": "ForTesting",
        "msg": "TestError"
      }
    ]
}
  
export const StakingIdl = {
    "version": "0.1.0",
    "name": "staking",
    "instructions": [
      {
        "name": "mockNodeWallet",
        "accounts": [
          {
            "name": "newAccount",
            "isMut": true,
            "isSigner": true
          },
          {
            "name": "bank",
            "isMut": true,
            "isSigner": true
          },
          {
            "name": "systemProgram",
            "isMut": false,
            "isSigner": false
          }
        ],
        "args": []
      },
      {
        "name": "updateNav",
        "accounts": [
          {
            "name": "data",
            "isMut": true,
            "isSigner": false
          },
          {
            "name": "oracle",
            "isMut": false,
            "isSigner": true,
            "docs": [
              "Oracle will not sign if there are unsold collateral"
            ]
          }
        ],
        "args": [
          {
            "name": "dailyNav",
            "type": "u64"
          },
          {
            "name": "dailyNavAdjusted",
            "type": "u64"
          }
        ]
      },
      {
        "name": "createDataAccount",
        "accounts": [
          {
            "name": "newAccount",
            "isMut": true,
            "isSigner": false
          },
          {
            "name": "bank",
            "isMut": true,
            "isSigner": true
          },
          {
            "name": "tokenProgram",
            "isMut": false,
            "isSigner": false
          },
          {
            "name": "mint",
            "isMut": true,
            "isSigner": false
          },
          {
            "name": "toTokenAccount",
            "isMut": true,
            "isSigner": false
          },
          {
            "name": "systemProgram",
            "isMut": false,
            "isSigner": false
          }
        ],
        "args": [
          {
            "name": "initialMint",
            "type": "u64"
          },
          {
            "name": "adjustment",
            "type": "i64"
          }
        ]
      },
      {
        "name": "updateWhitelistedStakesSize",
        "accounts": [
          {
            "name": "data",
            "isMut": true,
            "isSigner": false
          },
          {
            "name": "updater",
            "isMut": true,
            "isSigner": true
          }
        ],
        "args": []
      },
      {
        "name": "updateWhitelistedStakes",
        "accounts": [
          {
            "name": "data",
            "isMut": true,
            "isSigner": false
          },
          {
            "name": "updater",
            "isMut": true,
            "isSigner": true
          }
        ],
        "args": []
      },
      {
        "name": "stake",
        "accounts": [
          {
            "name": "data",
            "isMut": true,
            "isSigner": false
          },
          {
            "name": "depositor",
            "isMut": true,
            "isSigner": true
          },
          {
            "name": "tokenProgram",
            "isMut": false,
            "isSigner": false
          },
          {
            "name": "mint",
            "isMut": true,
            "isSigner": false
          },
          {
            "name": "oracle",
            "isMut": false,
            "isSigner": true,
            "docs": [
              "Oracle will not sign if there are unsold collateral"
            ]
          },
          {
            "name": "multiSig",
            "isMut": true,
            "isSigner": false
          },
          {
            "name": "toTokenAccount",
            "isMut": true,
            "isSigner": false
          },
          {
            "name": "systemProgram",
            "isMut": false,
            "isSigner": false
          },
          {
            "name": "nodeWallet",
            "isMut": false,
            "isSigner": false
          },
          {
            "name": "idleFunds",
            "isMut": false,
            "isSigner": false
          },
          {
            "name": "maxBidMint",
            "isMut": true,
            "isSigner": false
          }
        ],
        "args": [
          {
            "name": "solAmount",
            "type": "u64"
          },
          {
            "name": "currentNav",
            "type": "u64"
          }
        ]
      },
      {
        "name": "maxBidS",
        "accounts": [
          {
            "name": "data",
            "isMut": true,
            "isSigner": false
          },
          {
            "name": "depositor",
            "isMut": true,
            "isSigner": true
          },
          {
            "name": "tokenProgram",
            "isMut": false,
            "isSigner": false
          },
          {
            "name": "mint",
            "isMut": true,
            "isSigner": false
          },
          {
            "name": "oracle",
            "isMut": false,
            "isSigner": true,
            "docs": [
              "Oracle will not sign if there are unsold collateral"
            ]
          },
          {
            "name": "multiSig",
            "isMut": true,
            "isSigner": false
          },
          {
            "name": "toTokenAccount",
            "isMut": true,
            "isSigner": false
          },
          {
            "name": "systemProgram",
            "isMut": false,
            "isSigner": false
          },
          {
            "name": "nodeWallet",
            "isMut": false,
            "isSigner": false
          },
          {
            "name": "idleFunds",
            "isMut": false,
            "isSigner": false
          },
          {
            "name": "maxBidMint",
            "isMut": true,
            "isSigner": false
          }
        ],
        "args": [
          {
            "name": "solAmount",
            "type": "u64"
          },
          {
            "name": "currentNav",
            "type": "u64"
          }
        ]
      },
      {
        "name": "unstake",
        "accounts": [
          {
            "name": "data",
            "isMut": true,
            "isSigner": false
          },
          {
            "name": "unstakeAccount",
            "isMut": true,
            "isSigner": true
          },
          {
            "name": "depositor",
            "isMut": true,
            "isSigner": true
          },
          {
            "name": "tokenProgram",
            "isMut": false,
            "isSigner": false
          },
          {
            "name": "mint",
            "isMut": true,
            "isSigner": false
          },
          {
            "name": "oracle",
            "isMut": false,
            "isSigner": true,
            "docs": [
              "Oracle will not sign if there are unsold collateral"
            ]
          },
          {
            "name": "fromTokenAccount",
            "isMut": true,
            "isSigner": false
          },
          {
            "name": "systemProgram",
            "isMut": false,
            "isSigner": false
          },
          {
            "name": "nodeWallet",
            "isMut": false,
            "isSigner": false
          },
          {
            "name": "multiSig",
            "isMut": false,
            "isSigner": false
          },
          {
            "name": "idleFunds",
            "isMut": false,
            "isSigner": false
          },
          {
            "name": "maxBidMint",
            "isMut": true,
            "isSigner": false
          }
        ],
        "args": [
          {
            "name": "lstAmount",
            "type": "u64"
          },
          {
            "name": "currentNav",
            "type": "u64"
          }
        ]
      },
      {
        "name": "maxBidU",
        "accounts": [
          {
            "name": "data",
            "isMut": true,
            "isSigner": false
          },
          {
            "name": "unstakeAccount",
            "isMut": true,
            "isSigner": true
          },
          {
            "name": "depositor",
            "isMut": true,
            "isSigner": true
          },
          {
            "name": "tokenProgram",
            "isMut": false,
            "isSigner": false
          },
          {
            "name": "mint",
            "isMut": true,
            "isSigner": false
          },
          {
            "name": "oracle",
            "isMut": false,
            "isSigner": true,
            "docs": [
              "Oracle will not sign if there are unsold collateral"
            ]
          },
          {
            "name": "fromTokenAccount",
            "isMut": true,
            "isSigner": false
          },
          {
            "name": "systemProgram",
            "isMut": false,
            "isSigner": false
          },
          {
            "name": "nodeWallet",
            "isMut": false,
            "isSigner": false
          },
          {
            "name": "multiSig",
            "isMut": false,
            "isSigner": false
          },
          {
            "name": "idleFunds",
            "isMut": false,
            "isSigner": false
          },
          {
            "name": "maxBidMint",
            "isMut": true,
            "isSigner": false
          }
        ],
        "args": [
          {
            "name": "lstAmount",
            "type": "u64"
          },
          {
            "name": "currentNav",
            "type": "u64"
          }
        ]
      },
      {
        "name": "claim",
        "accounts": [
          {
            "name": "data",
            "isMut": true,
            "isSigner": false
          },
          {
            "name": "unstakeAccount",
            "isMut": true,
            "isSigner": false
          },
          {
            "name": "depositor",
            "isMut": true,
            "isSigner": true
          },
          {
            "name": "systemProgram",
            "isMut": false,
            "isSigner": false
          }
        ],
        "args": []
      }
    ],
    "accounts": [
      {
        "name": "nodeWallet",
        "type": {
          "kind": "struct",
          "fields": [
            {
              "name": "totalFunds",
              "type": "u64"
            },
            {
              "name": "totalBorrowed",
              "type": "u64"
            },
            {
              "name": "maintenanceLtv",
              "type": "u8"
            },
            {
              "name": "liquidationLtv",
              "type": "u8"
            },
            {
              "name": "nodeOperator",
              "type": "publicKey"
            }
          ]
        }
      },
      {
        "name": "dataAccount",
        "type": {
          "kind": "struct",
          "fields": [
            {
              "name": "borrowedAmountAdjustment",
              "type": "i64"
            },
            {
              "name": "dailyNav",
              "type": "u64"
            },
            {
              "name": "mint",
              "type": "publicKey"
            },
            {
              "name": "pendingUnstake",
              "type": "u64"
            },
            {
              "name": "dailyNavAdjusted",
              "type": "u64"
            },
            {
              "name": "prevDailyNav",
              "type": "u64"
            },
            {
              "name": "whitelistedStakeAccounts",
              "type": {
                "vec": "publicKey"
              }
            }
          ]
        }
      },
      {
        "name": "unstakeAccount",
        "type": {
          "kind": "struct",
          "fields": [
            {
              "name": "pendingUnstakeSol",
              "type": "u64"
            },
            {
              "name": "unstakeTimestamp",
              "type": "i64"
            },
            {
              "name": "depositor",
              "type": "publicKey"
            }
          ]
        }
      }
    ]
  };