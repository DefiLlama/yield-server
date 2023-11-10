module.exports = [
    {
        inputs: [],
        stateMutability: "nonpayable",
        type: "constructor"
    },
    {
        anonymous: false,
        inputs: [
            {
                indexed: true,
                internalType: "address",
                name: "user",
                type: "address"
            },
            {
                indexed: false,
                internalType: "uint256",
                name: "index",
                type: "uint256"
            },
            {
                indexed: false,
                internalType: "uint256",
                name: "payout",
                type: "uint256"
            }
        ],
        name: "Payout",
        type: "event"
    },
    {
        anonymous: false,
        inputs: [
            {
                indexed: true,
                internalType: "bytes32",
                name: "role",
                type: "bytes32"
            },
            {
                indexed: true,
                internalType: "bytes32",
                name: "previousAdminRole",
                type: "bytes32"
            },
            {
                indexed: true,
                internalType: "bytes32",
                name: "newAdminRole",
                type: "bytes32"
            }
        ],
        name: "RoleAdminChanged",
        type: "event"
    },
    {
        anonymous: false,
        inputs: [
            {
                indexed: true,
                internalType: "bytes32",
                name: "role",
                type: "bytes32"
            },
            {
                indexed: true,
                internalType: "address",
                name: "account",
                type: "address"
            },
            {
                indexed: true,
                internalType: "address",
                name: "sender",
                type: "address"
            }
        ],
        name: "RoleGranted",
        type: "event"
    },
    {
        anonymous: false,
        inputs: [
            {
                indexed: true,
                internalType: "bytes32",
                name: "role",
                type: "bytes32"
            },
            {
                indexed: true,
                internalType: "address",
                name: "account",
                type: "address"
            },
            {
                indexed: true,
                internalType: "address",
                name: "sender",
                type: "address"
            }
        ],
        name: "RoleRevoked",
        type: "event"
    },
    {
        anonymous: false,
        inputs: [
            {
                indexed: true,
                internalType: "address",
                name: "user",
                type: "address"
            },
            {
                indexed: false,
                internalType: "uint256",
                name: "index",
                type: "uint256"
            },
            {
                indexed: false,
                internalType: "uint256",
                name: "amount",
                type: "uint256"
            },
            {
                indexed: false,
                internalType: "uint8",
                name: "stakeType",
                type: "uint8"
            },
            {
                indexed: false,
                internalType: "uint256",
                name: "startTime",
                type: "uint256"
            },
            {
                indexed: false,
                internalType: "uint256",
                name: "endTime",
                type: "uint256"
            },
            {
                indexed: false,
                internalType: "uint256",
                name: "activeDeposits",
                type: "uint256"
            }
        ],
        name: "Stake",
        type: "event"
    },
    {
        anonymous: false,
        inputs: [
            {
                indexed: true,
                internalType: "address",
                name: "user",
                type: "address"
            },
            {
                indexed: false,
                internalType: "uint256",
                name: "index",
                type: "uint256"
            },
            {
                indexed: false,
                internalType: "uint256",
                name: "amount",
                type: "uint256"
            },
            {
                indexed: false,
                internalType: "uint256",
                name: "activeDeposits",
                type: "uint256"
            }
        ],
        name: "Unstake",
        type: "event"
    },
    {
        anonymous: false,
        inputs: [
            {
                indexed: true,
                internalType: "uint256",
                name: "stakeType",
                type: "uint256"
            },
            {
                indexed: false,
                internalType: "uint256",
                name: "newAllocPoint",
                type: "uint256"
            },
            {
                indexed: false,
                internalType: "uint256",
                name: "oldAllocPoint",
                type: "uint256"
            }
        ],
        name: "UpdateAllocationWithUpdate",
        type: "event"
    },
    {
        inputs: [],
        name: "DEFAULT_ADMIN_ROLE",
        outputs: [
            {
                internalType: "bytes32",
                name: "",
                type: "bytes32"
            }
        ],
        stateMutability: "view",
        type: "function"
    },
    {
        inputs: [],
        name: "GOVERNOR_ROLE",
        outputs: [
            {
                internalType: "bytes32",
                name: "",
                type: "bytes32"
            }
        ],
        stateMutability: "view",
        type: "function"
    },
    {
        inputs: [],
        name: "HYDT",
        outputs: [
            {
                internalType: "contract IHYDT",
                name: "",
                type: "address"
            }
        ],
        stateMutability: "view",
        type: "function"
    },
    {
        inputs: [],
        name: "HYGT",
        outputs: [
            {
                internalType: "contract IHYGT",
                name: "",
                type: "address"
            }
        ],
        stateMutability: "view",
        type: "function"
    },
    {
        inputs: [],
        name: "HYGTPerSecond",
        outputs: [
            {
                internalType: "uint256",
                name: "",
                type: "uint256"
            }
        ],
        stateMutability: "view",
        type: "function"
    },
    {
        inputs: [],
        name: "TREASURY",
        outputs: [
            {
                internalType: "address",
                name: "",
                type: "address"
            }
        ],
        stateMutability: "view",
        type: "function"
    },
    {
        inputs: [
            {
                internalType: "uint256",
                name: "stakeType",
                type: "uint256"
            },
            {
                internalType: "uint256",
                name: "index",
                type: "uint256"
            }
        ],
        name: "allPoolInfo",
        outputs: [
            {
                components: [
                    {
                        internalType: "uint8",
                        name: "stakeType",
                        type: "uint8"
                    },
                    {
                        internalType: "uint256",
                        name: "allocPoint",
                        type: "uint256"
                    },
                    {
                        internalType: "uint256",
                        name: "stakeSupply",
                        type: "uint256"
                    },
                    {
                        internalType: "uint256",
                        name: "accHYGTPerShare",
                        type: "uint256"
                    },
                    {
                        internalType: "uint256",
                        name: "lastRewardTime",
                        type: "uint256"
                    }
                ],
                internalType: "struct Earn.PoolInfo",
                name: "",
                type: "tuple"
            }
        ],
        stateMutability: "view",
        type: "function"
    },
    {
        inputs: [
            {
                internalType: "uint256",
                name: "index",
                type: "uint256"
            }
        ],
        name: "claimPayout",
        outputs: [],
        stateMutability: "nonpayable",
        type: "function"
    },
    {
        inputs: [
            {
                internalType: "uint256",
                name: "",
                type: "uint256"
            }
        ],
        name: "dailyPayouts",
        outputs: [
            {
                internalType: "uint256",
                name: "",
                type: "uint256"
            }
        ],
        stateMutability: "view",
        type: "function"
    },
    {
        inputs: [],
        name: "depositFee",
        outputs: [
            {
                internalType: "uint256",
                name: "",
                type: "uint256"
            }
        ],
        stateMutability: "view",
        type: "function"
    },
    {
        inputs: [
            {
                internalType: "address",
                name: "user",
                type: "address"
            }
        ],
        name: "getDailyPayoutBatch",
        outputs: [
            {
                internalType: "uint256",
                name: "",
                type: "uint256"
            }
        ],
        stateMutability: "view",
        type: "function"
    },
    {
        inputs: [
            {
                internalType: "address",
                name: "user",
                type: "address"
            },
            {
                internalType: "uint256",
                name: "index",
                type: "uint256"
            }
        ],
        name: "getPayout",
        outputs: [
            {
                internalType: "uint256",
                name: "",
                type: "uint256"
            }
        ],
        stateMutability: "view",
        type: "function"
    },
    {
        inputs: [
            {
                internalType: "address",
                name: "user",
                type: "address"
            }
        ],
        name: "getPayoutBatch",
        outputs: [
            {
                internalType: "uint256",
                name: "",
                type: "uint256"
            }
        ],
        stateMutability: "view",
        type: "function"
    },
    {
        inputs: [
            {
                internalType: "address",
                name: "user",
                type: "address"
            },
            {
                internalType: "uint8",
                name: "stakeType",
                type: "uint8"
            }
        ],
        name: "getPayoutType",
        outputs: [
            {
                internalType: "uint256",
                name: "",
                type: "uint256"
            }
        ],
        stateMutability: "view",
        type: "function"
    },
    {
        inputs: [
            {
                internalType: "address",
                name: "user",
                type: "address"
            },
            {
                internalType: "uint256",
                name: "index",
                type: "uint256"
            }
        ],
        name: "getPending",
        outputs: [
            {
                internalType: "uint256",
                name: "",
                type: "uint256"
            }
        ],
        stateMutability: "view",
        type: "function"
    },
    {
        inputs: [
            {
                internalType: "address",
                name: "user",
                type: "address"
            }
        ],
        name: "getPendingBatch",
        outputs: [
            {
                internalType: "uint256",
                name: "",
                type: "uint256"
            }
        ],
        stateMutability: "view",
        type: "function"
    },
    {
        inputs: [
            {
                internalType: "address",
                name: "user",
                type: "address"
            },
            {
                internalType: "uint8",
                name: "stakeType",
                type: "uint8"
            }
        ],
        name: "getPendingType",
        outputs: [
            {
                internalType: "uint256",
                name: "",
                type: "uint256"
            }
        ],
        stateMutability: "view",
        type: "function"
    },
    {
        inputs: [
            {
                internalType: "bytes32",
                name: "role",
                type: "bytes32"
            }
        ],
        name: "getRoleAdmin",
        outputs: [
            {
                internalType: "bytes32",
                name: "",
                type: "bytes32"
            }
        ],
        stateMutability: "view",
        type: "function"
    },
    {
        inputs: [
            {
                internalType: "address",
                name: "",
                type: "address"
            }
        ],
        name: "getStakingLengths",
        outputs: [
            {
                internalType: "uint256",
                name: "",
                type: "uint256"
            }
        ],
        stateMutability: "view",
        type: "function"
    },
    {
        inputs: [
            {
                internalType: "address",
                name: "",
                type: "address"
            },
            {
                internalType: "uint256",
                name: "",
                type: "uint256"
            }
        ],
        name: "getStakings",
        outputs: [
            {
                internalType: "uint256",
                name: "index",
                type: "uint256"
            },
            {
                internalType: "bool",
                name: "status",
                type: "bool"
            },
            {
                internalType: "uint256",
                name: "amount",
                type: "uint256"
            },
            {
                internalType: "uint8",
                name: "stakeType",
                type: "uint8"
            },
            {
                internalType: "uint256",
                name: "startTime",
                type: "uint256"
            },
            {
                internalType: "uint256",
                name: "endTime",
                type: "uint256"
            },
            {
                internalType: "uint256",
                name: "lastClaimTime",
                type: "uint256"
            },
            {
                internalType: "uint256",
                name: "rewardDebt",
                type: "uint256"
            }
        ],
        stateMutability: "view",
        type: "function"
    },
    {
        inputs: [
            {
                internalType: "bytes32",
                name: "role",
                type: "bytes32"
            },
            {
                internalType: "address",
                name: "account",
                type: "address"
            }
        ],
        name: "grantRole",
        outputs: [],
        stateMutability: "nonpayable",
        type: "function"
    },
    {
        inputs: [
            {
                internalType: "bytes32",
                name: "role",
                type: "bytes32"
            },
            {
                internalType: "address",
                name: "account",
                type: "address"
            }
        ],
        name: "hasRole",
        outputs: [
            {
                internalType: "bool",
                name: "",
                type: "bool"
            }
        ],
        stateMutability: "view",
        type: "function"
    },
    {
        inputs: [
            {
                internalType: "address",
                name: "hydt_",
                type: "address"
            },
            {
                internalType: "address",
                name: "hygt_",
                type: "address"
            },
            {
                internalType: "address",
                name: "shydt_",
                type: "address"
            },
            {
                internalType: "address",
                name: "treasury_",
                type: "address"
            },
            {
                internalType: "uint256",
                name: "initialMintStartTime_",
                type: "uint256"
            }
        ],
        name: "initialize",
        outputs: [],
        stateMutability: "nonpayable",
        type: "function"
    },
    {
        inputs: [
            {
                internalType: "uint256",
                name: "",
                type: "uint256"
            }
        ],
        name: "lockPeriods",
        outputs: [
            {
                internalType: "uint256",
                name: "",
                type: "uint256"
            }
        ],
        stateMutability: "view",
        type: "function"
    },
    {
        inputs: [],
        name: "massUpdatePools",
        outputs: [],
        stateMutability: "nonpayable",
        type: "function"
    },
    {
        inputs: [
            {
                internalType: "uint256",
                name: "",
                type: "uint256"
            }
        ],
        name: "poolInfo",
        outputs: [
            {
                internalType: "uint8",
                name: "stakeType",
                type: "uint8"
            },
            {
                internalType: "uint256",
                name: "allocPoint",
                type: "uint256"
            },
            {
                internalType: "uint256",
                name: "stakeSupply",
                type: "uint256"
            },
            {
                internalType: "uint256",
                name: "accHYGTPerShare",
                type: "uint256"
            },
            {
                internalType: "uint256",
                name: "lastRewardTime",
                type: "uint256"
            }
        ],
        stateMutability: "view",
        type: "function"
    },
    {
        inputs: [],
        name: "poolLength",
        outputs: [
            {
                internalType: "uint256",
                name: "",
                type: "uint256"
            }
        ],
        stateMutability: "view",
        type: "function"
    },
    {
        inputs: [
            {
                internalType: "bytes32",
                name: "role",
                type: "bytes32"
            },
            {
                internalType: "address",
                name: "account",
                type: "address"
            }
        ],
        name: "renounceRole",
        outputs: [],
        stateMutability: "nonpayable",
        type: "function"
    },
    {
        inputs: [
            {
                internalType: "bytes32",
                name: "role",
                type: "bytes32"
            },
            {
                internalType: "address",
                name: "account",
                type: "address"
            }
        ],
        name: "revokeRole",
        outputs: [],
        stateMutability: "nonpayable",
        type: "function"
    },
    {
        inputs: [],
        name: "sHYDT",
        outputs: [
            {
                internalType: "contract IHYDT",
                name: "",
                type: "address"
            }
        ],
        stateMutability: "view",
        type: "function"
    },
    {
        inputs: [
            {
                internalType: "uint256",
                name: "amount",
                type: "uint256"
            },
            {
                internalType: "uint8",
                name: "stakeType",
                type: "uint8"
            }
        ],
        name: "stake",
        outputs: [],
        stateMutability: "nonpayable",
        type: "function"
    },
    {
        inputs: [],
        name: "startTime",
        outputs: [
            {
                internalType: "uint256",
                name: "",
                type: "uint256"
            }
        ],
        stateMutability: "view",
        type: "function"
    },
    {
        inputs: [
            {
                internalType: "bytes4",
                name: "interfaceId",
                type: "bytes4"
            }
        ],
        name: "supportsInterface",
        outputs: [
            {
                internalType: "bool",
                name: "",
                type: "bool"
            }
        ],
        stateMutability: "view",
        type: "function"
    },
    {
        inputs: [],
        name: "totalAllocPoint",
        outputs: [
            {
                internalType: "uint256",
                name: "",
                type: "uint256"
            }
        ],
        stateMutability: "view",
        type: "function"
    },
    {
        inputs: [
            {
                internalType: "uint8",
                name: "stakeType",
                type: "uint8"
            },
            {
                internalType: "uint256",
                name: "newAllocPoint",
                type: "uint256"
            }
        ],
        name: "updateAllocationWithUpdate",
        outputs: [],
        stateMutability: "nonpayable",
        type: "function"
    },
    {
        inputs: [
            {
                internalType: "uint8",
                name: "stakeType",
                type: "uint8"
            }
        ],
        name: "updatePool",
        outputs: [
            {
                internalType: "uint256",
                name: "",
                type: "uint256"
            }
        ],
        stateMutability: "nonpayable",
        type: "function"
    },
    {
        inputs: [
            {
                internalType: "uint256",
                name: "",
                type: "uint256"
            }
        ],
        name: "yearlyYields",
        outputs: [
            {
                internalType: "uint256",
                name: "",
                type: "uint256"
            }
        ],
        stateMutability: "view",
        type: "function"
    }
];