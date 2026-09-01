const TEAHOUSE_VAULT_V3_ABI = [{"inputs": [], "stateMutability": "nonpayable", "type": "constructor"}, {
    "inputs": [],
    "name": "CallerIsNotManager",
    "type": "error"
}, {
    "inputs": [{"internalType": "uint256", "name": "minAmount", "type": "uint256"}, {
        "internalType": "uint256",
        "name": "convertedAmount",
        "type": "uint256"
    }], "name": "InsufficientSwapResult", "type": "error"
}, {"inputs": [], "name": "InvalidCallbackCaller", "type": "error"}, {
    "inputs": [],
    "name": "InvalidCallbackStatus",
    "type": "error"
}, {"inputs": [], "name": "InvalidFeeCap", "type": "error"}, {
    "inputs": [],
    "name": "InvalidFeePercentage",
    "type": "error"
}, {
    "inputs": [{"internalType": "uint256", "name": "amount0", "type": "uint256"}, {
        "internalType": "uint256",
        "name": "amount1",
        "type": "uint256"
    }], "name": "InvalidPriceSlippage", "type": "error"
}, {"inputs": [], "name": "InvalidShareAmount", "type": "error"}, {
    "inputs": [],
    "name": "InvalidSwapReceiver",
    "type": "error"
}, {"inputs": [], "name": "InvalidSwapToken", "type": "error"}, {
    "inputs": [],
    "name": "InvalidTokenOrder",
    "type": "error"
}, {"inputs": [], "name": "PoolNotInitialized", "type": "error"}, {
    "inputs": [],
    "name": "PositionDoesNotExist",
    "type": "error"
}, {"inputs": [], "name": "PositionLengthExceedsLimit", "type": "error"}, {
    "inputs": [],
    "name": "SwapInZeroLiquidityRegion",
    "type": "error"
}, {"inputs": [], "name": "TransactionExpired", "type": "error"}, {
    "inputs": [],
    "name": "ZeroLiquidity",
    "type": "error"
}, {
    "anonymous": false,
    "inputs": [{"indexed": true, "internalType": "address", "name": "pool", "type": "address"}, {
        "indexed": false,
        "internalType": "int24",
        "name": "tickLower",
        "type": "int24"
    }, {"indexed": false, "internalType": "int24", "name": "tickUpper", "type": "int24"}, {
        "indexed": false,
        "internalType": "uint128",
        "name": "liquidity",
        "type": "uint128"
    }, {"indexed": false, "internalType": "uint256", "name": "amount0", "type": "uint256"}, {
        "indexed": false,
        "internalType": "uint256",
        "name": "amount1",
        "type": "uint256"
    }],
    "name": "AddLiquidity",
    "type": "event"
}, {
    "anonymous": false,
    "inputs": [{
        "indexed": false,
        "internalType": "address",
        "name": "previousAdmin",
        "type": "address"
    }, {"indexed": false, "internalType": "address", "name": "newAdmin", "type": "address"}],
    "name": "AdminChanged",
    "type": "event"
}, {
    "anonymous": false,
    "inputs": [{"indexed": true, "internalType": "address", "name": "owner", "type": "address"}, {
        "indexed": true,
        "internalType": "address",
        "name": "spender",
        "type": "address"
    }, {"indexed": false, "internalType": "uint256", "name": "value", "type": "uint256"}],
    "name": "Approval",
    "type": "event"
}, {
    "anonymous": false,
    "inputs": [{"indexed": true, "internalType": "address", "name": "beacon", "type": "address"}],
    "name": "BeaconUpgraded",
    "type": "event"
}, {
    "anonymous": false,
    "inputs": [{"indexed": true, "internalType": "address", "name": "pool", "type": "address"}, {
        "indexed": false,
        "internalType": "int24",
        "name": "tickLower",
        "type": "int24"
    }, {"indexed": false, "internalType": "int24", "name": "tickUpper", "type": "int24"}, {
        "indexed": false,
        "internalType": "uint256",
        "name": "amount0",
        "type": "uint256"
    }, {"indexed": false, "internalType": "uint256", "name": "amount1", "type": "uint256"}],
    "name": "Collect",
    "type": "event"
}, {
    "anonymous": false,
    "inputs": [{"indexed": true, "internalType": "address", "name": "pool", "type": "address"}, {
        "indexed": false,
        "internalType": "uint256",
        "name": "amount0",
        "type": "uint256"
    }, {"indexed": false, "internalType": "uint256", "name": "amount1", "type": "uint256"}, {
        "indexed": false,
        "internalType": "uint256",
        "name": "feeAmount0",
        "type": "uint256"
    }, {"indexed": false, "internalType": "uint256", "name": "feeAmount1", "type": "uint256"}],
    "name": "CollectSwapFees",
    "type": "event"
}, {
    "anonymous": false,
    "inputs": [{"indexed": true, "internalType": "address", "name": "shareOwner", "type": "address"}, {
        "indexed": false,
        "internalType": "uint256",
        "name": "shares",
        "type": "uint256"
    }, {"indexed": false, "internalType": "uint256", "name": "amount0", "type": "uint256"}, {
        "indexed": false,
        "internalType": "uint256",
        "name": "amount1",
        "type": "uint256"
    }, {"indexed": false, "internalType": "uint256", "name": "feeAmount0", "type": "uint256"}, {
        "indexed": false,
        "internalType": "uint256",
        "name": "feeAmount1",
        "type": "uint256"
    }],
    "name": "DepositShares",
    "type": "event"
}, {
    "anonymous": false,
    "inputs": [{"indexed": true, "internalType": "address", "name": "sender", "type": "address"}, {
        "indexed": false,
        "internalType": "uint256",
        "name": "timestamp",
        "type": "uint256"
    }, {
        "components": [{"internalType": "address", "name": "vault", "type": "address"}, {
            "internalType": "uint24",
            "name": "entryFee",
            "type": "uint24"
        }, {"internalType": "uint24", "name": "exitFee", "type": "uint24"}, {
            "internalType": "uint24",
            "name": "performanceFee",
            "type": "uint24"
        }, {"internalType": "uint24", "name": "managementFee", "type": "uint24"}],
        "indexed": false,
        "internalType": "struct ITeaVaultV3Pair.FeeConfig",
        "name": "feeConfig",
        "type": "tuple"
    }],
    "name": "FeeConfigChanged",
    "type": "event"
}, {
    "anonymous": false,
    "inputs": [{"indexed": false, "internalType": "uint8", "name": "version", "type": "uint8"}],
    "name": "Initialized",
    "type": "event"
}, {
    "anonymous": false,
    "inputs": [{"indexed": false, "internalType": "uint256", "name": "shares", "type": "uint256"}],
    "name": "ManagementFeeCollected",
    "type": "event"
}, {
    "anonymous": false,
    "inputs": [{"indexed": true, "internalType": "address", "name": "sender", "type": "address"}, {
        "indexed": true,
        "internalType": "address",
        "name": "newManager",
        "type": "address"
    }],
    "name": "ManagerChanged",
    "type": "event"
}, {
    "anonymous": false,
    "inputs": [{
        "indexed": true,
        "internalType": "address",
        "name": "previousOwner",
        "type": "address"
    }, {"indexed": true, "internalType": "address", "name": "newOwner", "type": "address"}],
    "name": "OwnershipTransferred",
    "type": "event"
}, {
    "anonymous": false,
    "inputs": [{"indexed": true, "internalType": "address", "name": "pool", "type": "address"}, {
        "indexed": false,
        "internalType": "int24",
        "name": "tickLower",
        "type": "int24"
    }, {"indexed": false, "internalType": "int24", "name": "tickUpper", "type": "int24"}, {
        "indexed": false,
        "internalType": "uint128",
        "name": "liquidity",
        "type": "uint128"
    }, {"indexed": false, "internalType": "uint256", "name": "amount0", "type": "uint256"}, {
        "indexed": false,
        "internalType": "uint256",
        "name": "amount1",
        "type": "uint256"
    }],
    "name": "RemoveLiquidity",
    "type": "event"
}, {
    "anonymous": false,
    "inputs": [{"indexed": true, "internalType": "bool", "name": "zeroForOne", "type": "bool"}, {
        "indexed": true,
        "internalType": "bool",
        "name": "exactInput",
        "type": "bool"
    }, {"indexed": false, "internalType": "uint256", "name": "amountIn", "type": "uint256"}, {
        "indexed": false,
        "internalType": "uint256",
        "name": "amountOut",
        "type": "uint256"
    }],
    "name": "Swap",
    "type": "event"
}, {
    "anonymous": false,
    "inputs": [{"indexed": true, "internalType": "address", "name": "teaVaultAddress", "type": "address"}],
    "name": "TeaVaultV3PairCreated",
    "type": "event"
}, {
    "anonymous": false,
    "inputs": [{"indexed": true, "internalType": "address", "name": "from", "type": "address"}, {
        "indexed": true,
        "internalType": "address",
        "name": "to",
        "type": "address"
    }, {"indexed": false, "internalType": "uint256", "name": "value", "type": "uint256"}],
    "name": "Transfer",
    "type": "event"
}, {
    "anonymous": false,
    "inputs": [{"indexed": true, "internalType": "address", "name": "implementation", "type": "address"}],
    "name": "Upgraded",
    "type": "event"
}, {
    "anonymous": false,
    "inputs": [{"indexed": true, "internalType": "address", "name": "shareOwner", "type": "address"}, {
        "indexed": false,
        "internalType": "uint256",
        "name": "shares",
        "type": "uint256"
    }, {"indexed": false, "internalType": "uint256", "name": "amount0", "type": "uint256"}, {
        "indexed": false,
        "internalType": "uint256",
        "name": "amount1",
        "type": "uint256"
    }, {"indexed": false, "internalType": "uint256", "name": "feeShares", "type": "uint256"}],
    "name": "WithdrawShares",
    "type": "event"
}, {
    "inputs": [],
    "name": "DECIMALS_MULTIPLIER",
    "outputs": [{"internalType": "uint256", "name": "", "type": "uint256"}],
    "stateMutability": "view",
    "type": "function"
}, {
    "inputs": [],
    "name": "FEE_CAP",
    "outputs": [{"internalType": "uint256", "name": "", "type": "uint256"}],
    "stateMutability": "view",
    "type": "function"
}, {
    "inputs": [],
    "name": "FEE_MULTIPLIER",
    "outputs": [{"internalType": "uint256", "name": "", "type": "uint256"}],
    "stateMutability": "view",
    "type": "function"
}, {
    "inputs": [],
    "name": "SECONDS_IN_A_YEAR",
    "outputs": [{"internalType": "uint256", "name": "", "type": "uint256"}],
    "stateMutability": "view",
    "type": "function"
}, {
    "inputs": [{"internalType": "int24", "name": "_tickLower", "type": "int24"}, {
        "internalType": "int24",
        "name": "_tickUpper",
        "type": "int24"
    }, {"internalType": "uint128", "name": "_liquidity", "type": "uint128"}, {
        "internalType": "uint256",
        "name": "_amount0Min",
        "type": "uint256"
    }, {"internalType": "uint256", "name": "_amount1Min", "type": "uint256"}, {
        "internalType": "uint64",
        "name": "_deadline",
        "type": "uint64"
    }],
    "name": "addLiquidity",
    "outputs": [{"internalType": "uint256", "name": "amount0", "type": "uint256"}, {
        "internalType": "uint256",
        "name": "amount1",
        "type": "uint256"
    }],
    "stateMutability": "nonpayable",
    "type": "function"
}, {
    "inputs": [],
    "name": "allPositionInfo",
    "outputs": [{"internalType": "uint256", "name": "amount0", "type": "uint256"}, {
        "internalType": "uint256",
        "name": "amount1",
        "type": "uint256"
    }, {"internalType": "uint256", "name": "fee0", "type": "uint256"}, {
        "internalType": "uint256",
        "name": "fee1",
        "type": "uint256"
    }],
    "stateMutability": "view",
    "type": "function"
}, {
    "inputs": [{"internalType": "address", "name": "owner", "type": "address"}, {
        "internalType": "address",
        "name": "spender",
        "type": "address"
    }],
    "name": "allowance",
    "outputs": [{"internalType": "uint256", "name": "", "type": "uint256"}],
    "stateMutability": "view",
    "type": "function"
}, {
    "inputs": [{"internalType": "address", "name": "spender", "type": "address"}, {
        "internalType": "uint256",
        "name": "amount",
        "type": "uint256"
    }],
    "name": "approve",
    "outputs": [{"internalType": "bool", "name": "", "type": "bool"}],
    "stateMutability": "nonpayable",
    "type": "function"
}, {
    "inputs": [],
    "name": "assetToken0",
    "outputs": [{"internalType": "address", "name": "", "type": "address"}],
    "stateMutability": "view",
    "type": "function"
}, {
    "inputs": [],
    "name": "assetToken1",
    "outputs": [{"internalType": "address", "name": "", "type": "address"}],
    "stateMutability": "view",
    "type": "function"
}, {
    "inputs": [{"internalType": "address", "name": "_manager", "type": "address"}],
    "name": "assignManager",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
}, {
    "inputs": [{"internalType": "address", "name": "_router1Inch", "type": "address"}],
    "name": "assignRouter1Inch",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
}, {
    "inputs": [{"internalType": "address", "name": "account", "type": "address"}],
    "name": "balanceOf",
    "outputs": [{"internalType": "uint256", "name": "", "type": "uint256"}],
    "stateMutability": "view",
    "type": "function"
}, {
    "inputs": [{"internalType": "address", "name": "clipperExchange", "type": "address"}, {
        "internalType": "address",
        "name": "srcToken",
        "type": "address"
    }, {"internalType": "address", "name": "dstToken", "type": "address"}, {
        "internalType": "uint256",
        "name": "inputAmount",
        "type": "uint256"
    }, {"internalType": "uint256", "name": "outputAmount", "type": "uint256"}, {
        "internalType": "uint256",
        "name": "goodUntil",
        "type": "uint256"
    }, {"internalType": "bytes32", "name": "r", "type": "bytes32"}, {
        "internalType": "bytes32",
        "name": "vs",
        "type": "bytes32"
    }],
    "name": "clipperSwap",
    "outputs": [{"internalType": "uint256", "name": "returnAmount", "type": "uint256"}],
    "stateMutability": "nonpayable",
    "type": "function"
}, {
    "inputs": [],
    "name": "collectAllSwapFee",
    "outputs": [{"internalType": "uint128", "name": "amount0", "type": "uint128"}, {
        "internalType": "uint128",
        "name": "amount1",
        "type": "uint128"
    }],
    "stateMutability": "nonpayable",
    "type": "function"
}, {
    "inputs": [],
    "name": "collectManagementFee",
    "outputs": [{"internalType": "uint256", "name": "collectedShares", "type": "uint256"}],
    "stateMutability": "nonpayable",
    "type": "function"
}, {
    "inputs": [{"internalType": "int24", "name": "_tickLower", "type": "int24"}, {
        "internalType": "int24",
        "name": "_tickUpper",
        "type": "int24"
    }],
    "name": "collectPositionSwapFee",
    "outputs": [{"internalType": "uint128", "name": "amount0", "type": "uint128"}, {
        "internalType": "uint128",
        "name": "amount1",
        "type": "uint128"
    }],
    "stateMutability": "nonpayable",
    "type": "function"
}, {
    "inputs": [],
    "name": "decimals",
    "outputs": [{"internalType": "uint8", "name": "", "type": "uint8"}],
    "stateMutability": "view",
    "type": "function"
}, {
    "inputs": [{"internalType": "address", "name": "spender", "type": "address"}, {
        "internalType": "uint256",
        "name": "subtractedValue",
        "type": "uint256"
    }],
    "name": "decreaseAllowance",
    "outputs": [{"internalType": "bool", "name": "", "type": "bool"}],
    "stateMutability": "nonpayable",
    "type": "function"
}, {
    "inputs": [{"internalType": "uint256", "name": "_shares", "type": "uint256"}, {
        "internalType": "uint256",
        "name": "_amount0Max",
        "type": "uint256"
    }, {"internalType": "uint256", "name": "_amount1Max", "type": "uint256"}],
    "name": "deposit",
    "outputs": [{"internalType": "uint256", "name": "depositedAmount0", "type": "uint256"}, {
        "internalType": "uint256",
        "name": "depositedAmount1",
        "type": "uint256"
    }],
    "stateMutability": "nonpayable",
    "type": "function"
}, {
    "inputs": [],
    "name": "estimatedValueInToken0",
    "outputs": [{"internalType": "uint256", "name": "value0", "type": "uint256"}],
    "stateMutability": "view",
    "type": "function"
}, {
    "inputs": [],
    "name": "estimatedValueInToken1",
    "outputs": [{"internalType": "uint256", "name": "value1", "type": "uint256"}],
    "stateMutability": "view",
    "type": "function"
}, {
    "inputs": [],
    "name": "feeConfig",
    "outputs": [{"internalType": "address", "name": "vault", "type": "address"}, {
        "internalType": "uint24",
        "name": "entryFee",
        "type": "uint24"
    }, {"internalType": "uint24", "name": "exitFee", "type": "uint24"}, {
        "internalType": "uint24",
        "name": "performanceFee",
        "type": "uint24"
    }, {"internalType": "uint24", "name": "managementFee", "type": "uint24"}],
    "stateMutability": "view",
    "type": "function"
}, {
    "inputs": [],
    "name": "getAllPositions",
    "outputs": [{
        "components": [{
            "internalType": "int24",
            "name": "tickLower",
            "type": "int24"
        }, {"internalType": "int24", "name": "tickUpper", "type": "int24"}, {
            "internalType": "uint128",
            "name": "liquidity",
            "type": "uint128"
        }], "internalType": "struct ITeaVaultV3Pair.Position[]", "name": "results", "type": "tuple[]"
    }],
    "stateMutability": "view",
    "type": "function"
}, {
    "inputs": [{"internalType": "int24", "name": "tickLower", "type": "int24"}, {
        "internalType": "int24",
        "name": "tickUpper",
        "type": "int24"
    }, {"internalType": "uint128", "name": "liquidity", "type": "uint128"}],
    "name": "getAmountsForLiquidity",
    "outputs": [{"internalType": "uint256", "name": "amount0", "type": "uint256"}, {
        "internalType": "uint256",
        "name": "amount1",
        "type": "uint256"
    }],
    "stateMutability": "view",
    "type": "function"
}, {
    "inputs": [{"internalType": "int24", "name": "tickLower", "type": "int24"}, {
        "internalType": "int24",
        "name": "tickUpper",
        "type": "int24"
    }, {"internalType": "uint256", "name": "amount0", "type": "uint256"}, {
        "internalType": "uint256",
        "name": "amount1",
        "type": "uint256"
    }],
    "name": "getLiquidityForAmounts",
    "outputs": [{"internalType": "uint128", "name": "liquidity", "type": "uint128"}],
    "stateMutability": "view",
    "type": "function"
}, {
    "inputs": [],
    "name": "getPoolInfo",
    "outputs": [{"internalType": "address", "name": "", "type": "address"}, {
        "internalType": "address",
        "name": "",
        "type": "address"
    }, {"internalType": "uint8", "name": "", "type": "uint8"}, {
        "internalType": "uint8",
        "name": "",
        "type": "uint8"
    }, {"internalType": "uint24", "name": "", "type": "uint24"}, {
        "internalType": "uint160",
        "name": "",
        "type": "uint160"
    }, {"internalType": "int24", "name": "", "type": "int24"}],
    "stateMutability": "view",
    "type": "function"
}, {
    "inputs": [],
    "name": "getToken0Balance",
    "outputs": [{"internalType": "uint256", "name": "amount", "type": "uint256"}],
    "stateMutability": "view",
    "type": "function"
}, {
    "inputs": [],
    "name": "getToken1Balance",
    "outputs": [{"internalType": "uint256", "name": "amount", "type": "uint256"}],
    "stateMutability": "view",
    "type": "function"
}, {
    "inputs": [{"internalType": "address", "name": "spender", "type": "address"}, {
        "internalType": "uint256",
        "name": "addedValue",
        "type": "uint256"
    }],
    "name": "increaseAllowance",
    "outputs": [{"internalType": "bool", "name": "", "type": "bool"}],
    "stateMutability": "nonpayable",
    "type": "function"
}, {
    "inputs": [{"internalType": "string", "name": "_name", "type": "string"}, {
        "internalType": "string",
        "name": "_symbol",
        "type": "string"
    }, {"internalType": "address", "name": "_factory", "type": "address"}, {
        "internalType": "address",
        "name": "_token0",
        "type": "address"
    }, {"internalType": "address", "name": "_token1", "type": "address"}, {
        "internalType": "uint24",
        "name": "_feeTier",
        "type": "uint24"
    }, {"internalType": "uint8", "name": "_decimalOffset", "type": "uint8"}, {
        "internalType": "uint24",
        "name": "_feeCap",
        "type": "uint24"
    }, {
        "components": [{"internalType": "address", "name": "vault", "type": "address"}, {
            "internalType": "uint24",
            "name": "entryFee",
            "type": "uint24"
        }, {"internalType": "uint24", "name": "exitFee", "type": "uint24"}, {
            "internalType": "uint24",
            "name": "performanceFee",
            "type": "uint24"
        }, {"internalType": "uint24", "name": "managementFee", "type": "uint24"}],
        "internalType": "struct ITeaVaultV3Pair.FeeConfig",
        "name": "_feeConfig",
        "type": "tuple"
    }, {"internalType": "address", "name": "_owner", "type": "address"}],
    "name": "initialize",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
}, {
    "inputs": [],
    "name": "lastCollectManagementFee",
    "outputs": [{"internalType": "uint256", "name": "", "type": "uint256"}],
    "stateMutability": "view",
    "type": "function"
}, {
    "inputs": [],
    "name": "manager",
    "outputs": [{"internalType": "address", "name": "", "type": "address"}],
    "stateMutability": "view",
    "type": "function"
}, {
    "inputs": [{"internalType": "bytes[]", "name": "data", "type": "bytes[]"}],
    "name": "multicall",
    "outputs": [{"internalType": "bytes[]", "name": "results", "type": "bytes[]"}],
    "stateMutability": "nonpayable",
    "type": "function"
}, {
    "inputs": [],
    "name": "name",
    "outputs": [{"internalType": "string", "name": "", "type": "string"}],
    "stateMutability": "view",
    "type": "function"
}, {
    "inputs": [],
    "name": "owner",
    "outputs": [{"internalType": "address", "name": "", "type": "address"}],
    "stateMutability": "view",
    "type": "function"
}, {
    "inputs": [],
    "name": "pool",
    "outputs": [{"internalType": "contract IUniswapV3Pool", "name": "", "type": "address"}],
    "stateMutability": "view",
    "type": "function"
}, {
    "inputs": [{"internalType": "uint256", "name": "_index", "type": "uint256"}],
    "name": "positionInfo",
    "outputs": [{"internalType": "uint256", "name": "amount0", "type": "uint256"}, {
        "internalType": "uint256",
        "name": "amount1",
        "type": "uint256"
    }, {"internalType": "uint256", "name": "fee0", "type": "uint256"}, {
        "internalType": "uint256",
        "name": "fee1",
        "type": "uint256"
    }],
    "stateMutability": "view",
    "type": "function"
}, {
    "inputs": [{"internalType": "int24", "name": "_tickLower", "type": "int24"}, {
        "internalType": "int24",
        "name": "_tickUpper",
        "type": "int24"
    }],
    "name": "positionInfo",
    "outputs": [{"internalType": "uint256", "name": "amount0", "type": "uint256"}, {
        "internalType": "uint256",
        "name": "amount1",
        "type": "uint256"
    }, {"internalType": "uint256", "name": "fee0", "type": "uint256"}, {
        "internalType": "uint256",
        "name": "fee1",
        "type": "uint256"
    }],
    "stateMutability": "view",
    "type": "function"
}, {
    "inputs": [{"internalType": "uint256", "name": "", "type": "uint256"}],
    "name": "positions",
    "outputs": [{"internalType": "int24", "name": "tickLower", "type": "int24"}, {
        "internalType": "int24",
        "name": "tickUpper",
        "type": "int24"
    }, {"internalType": "uint128", "name": "liquidity", "type": "uint128"}],
    "stateMutability": "view",
    "type": "function"
}, {
    "inputs": [],
    "name": "proxiableUUID",
    "outputs": [{"internalType": "bytes32", "name": "", "type": "bytes32"}],
    "stateMutability": "view",
    "type": "function"
}, {
    "inputs": [{"internalType": "int24", "name": "_tickLower", "type": "int24"}, {
        "internalType": "int24",
        "name": "_tickUpper",
        "type": "int24"
    }, {"internalType": "uint128", "name": "_liquidity", "type": "uint128"}, {
        "internalType": "uint256",
        "name": "_amount0Min",
        "type": "uint256"
    }, {"internalType": "uint256", "name": "_amount1Min", "type": "uint256"}, {
        "internalType": "uint64",
        "name": "_deadline",
        "type": "uint64"
    }],
    "name": "removeLiquidity",
    "outputs": [{"internalType": "uint256", "name": "amount0", "type": "uint256"}, {
        "internalType": "uint256",
        "name": "amount1",
        "type": "uint256"
    }],
    "stateMutability": "nonpayable",
    "type": "function"
}, {
    "inputs": [],
    "name": "renounceOwnership",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
}, {
    "inputs": [],
    "name": "router1Inch",
    "outputs": [{"internalType": "contract IGenericRouter1Inch", "name": "", "type": "address"}],
    "stateMutability": "view",
    "type": "function"
}, {
    "inputs": [{
        "components": [{
            "internalType": "address",
            "name": "vault",
            "type": "address"
        }, {"internalType": "uint24", "name": "entryFee", "type": "uint24"}, {
            "internalType": "uint24",
            "name": "exitFee",
            "type": "uint24"
        }, {"internalType": "uint24", "name": "performanceFee", "type": "uint24"}, {
            "internalType": "uint24",
            "name": "managementFee",
            "type": "uint24"
        }], "internalType": "struct ITeaVaultV3Pair.FeeConfig", "name": "_feeConfig", "type": "tuple"
    }], "name": "setFeeConfig", "outputs": [], "stateMutability": "nonpayable", "type": "function"
}, {
    "inputs": [{"internalType": "bool", "name": "_zeroForOne", "type": "bool"}, {
        "internalType": "uint256",
        "name": "_amountIn",
        "type": "uint256"
    }], "name": "simulateSwapInputSingleInternal", "outputs": [], "stateMutability": "nonpayable", "type": "function"
}, {
    "inputs": [{
        "internalType": "address",
        "name": "executor",
        "type": "address"
    }, {
        "components": [{"internalType": "address", "name": "srcToken", "type": "address"}, {
            "internalType": "address",
            "name": "dstToken",
            "type": "address"
        }, {
            "internalType": "address payable",
            "name": "srcReceiver",
            "type": "address"
        }, {"internalType": "address payable", "name": "dstReceiver", "type": "address"}, {
            "internalType": "uint256",
            "name": "amount",
            "type": "uint256"
        }, {"internalType": "uint256", "name": "minReturnAmount", "type": "uint256"}, {
            "internalType": "uint256",
            "name": "flags",
            "type": "uint256"
        }], "internalType": "struct IGenericRouter1Inch.SwapDescription", "name": "desc", "type": "tuple"
    }, {"internalType": "bytes", "name": "permit", "type": "bytes"}, {
        "internalType": "bytes",
        "name": "data",
        "type": "bytes"
    }],
    "name": "swap",
    "outputs": [{"internalType": "uint256", "name": "returnAmount", "type": "uint256"}, {
        "internalType": "uint256",
        "name": "spentAmount",
        "type": "uint256"
    }],
    "stateMutability": "nonpayable",
    "type": "function"
}, {
    "inputs": [{"internalType": "bool", "name": "_zeroForOne", "type": "bool"}, {
        "internalType": "uint256",
        "name": "_amountIn",
        "type": "uint256"
    }, {"internalType": "uint256", "name": "_amountOutMin", "type": "uint256"}, {
        "internalType": "uint160",
        "name": "_minPriceInSqrtPriceX96",
        "type": "uint160"
    }, {"internalType": "uint64", "name": "_deadline", "type": "uint64"}],
    "name": "swapInputSingle",
    "outputs": [{"internalType": "uint256", "name": "amountOut", "type": "uint256"}],
    "stateMutability": "nonpayable",
    "type": "function"
}, {
    "inputs": [{"internalType": "bool", "name": "_zeroForOne", "type": "bool"}, {
        "internalType": "uint256",
        "name": "_amountOut",
        "type": "uint256"
    }, {"internalType": "uint256", "name": "_amountInMax", "type": "uint256"}, {
        "internalType": "uint160",
        "name": "_maxPriceInSqrtPriceX96",
        "type": "uint160"
    }, {"internalType": "uint64", "name": "_deadline", "type": "uint64"}],
    "name": "swapOutputSingle",
    "outputs": [{"internalType": "uint256", "name": "amountIn", "type": "uint256"}],
    "stateMutability": "nonpayable",
    "type": "function"
}, {
    "inputs": [],
    "name": "symbol",
    "outputs": [{"internalType": "string", "name": "", "type": "string"}],
    "stateMutability": "view",
    "type": "function"
}, {
    "inputs": [],
    "name": "totalSupply",
    "outputs": [{"internalType": "uint256", "name": "", "type": "uint256"}],
    "stateMutability": "view",
    "type": "function"
}, {
    "inputs": [{"internalType": "address", "name": "to", "type": "address"}, {
        "internalType": "uint256",
        "name": "amount",
        "type": "uint256"
    }],
    "name": "transfer",
    "outputs": [{"internalType": "bool", "name": "", "type": "bool"}],
    "stateMutability": "nonpayable",
    "type": "function"
}, {
    "inputs": [{"internalType": "address", "name": "from", "type": "address"}, {
        "internalType": "address",
        "name": "to",
        "type": "address"
    }, {"internalType": "uint256", "name": "amount", "type": "uint256"}],
    "name": "transferFrom",
    "outputs": [{"internalType": "bool", "name": "", "type": "bool"}],
    "stateMutability": "nonpayable",
    "type": "function"
}, {
    "inputs": [{"internalType": "address", "name": "newOwner", "type": "address"}],
    "name": "transferOwnership",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
}, {
    "inputs": [{"internalType": "uint256", "name": "_amount0Owed", "type": "uint256"}, {
        "internalType": "uint256",
        "name": "_amount1Owed",
        "type": "uint256"
    }, {"internalType": "bytes", "name": "_data", "type": "bytes"}],
    "name": "uniswapV3MintCallback",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
}, {
    "inputs": [{"internalType": "uint256", "name": "amount", "type": "uint256"}, {
        "internalType": "uint256",
        "name": "minReturn",
        "type": "uint256"
    }, {"internalType": "uint256[]", "name": "pools", "type": "uint256[]"}],
    "name": "uniswapV3Swap",
    "outputs": [{"internalType": "uint256", "name": "returnAmount", "type": "uint256"}],
    "stateMutability": "nonpayable",
    "type": "function"
}, {
    "inputs": [{"internalType": "int256", "name": "_amount0Delta", "type": "int256"}, {
        "internalType": "int256",
        "name": "_amount1Delta",
        "type": "int256"
    }, {"internalType": "bytes", "name": "_data", "type": "bytes"}],
    "name": "uniswapV3SwapCallback",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
}, {
    "inputs": [{"internalType": "address", "name": "srcToken", "type": "address"}, {
        "internalType": "uint256",
        "name": "amount",
        "type": "uint256"
    }, {"internalType": "uint256", "name": "minReturn", "type": "uint256"}, {
        "internalType": "uint256[]",
        "name": "pools",
        "type": "uint256[]"
    }],
    "name": "unoswap",
    "outputs": [{"internalType": "uint256", "name": "returnAmount", "type": "uint256"}],
    "stateMutability": "nonpayable",
    "type": "function"
}, {
    "inputs": [{"internalType": "address", "name": "newImplementation", "type": "address"}],
    "name": "upgradeTo",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
}, {
    "inputs": [{"internalType": "address", "name": "newImplementation", "type": "address"}, {
        "internalType": "bytes",
        "name": "data",
        "type": "bytes"
    }], "name": "upgradeToAndCall", "outputs": [], "stateMutability": "payable", "type": "function"
}, {
    "inputs": [],
    "name": "vaultAllUnderlyingAssets",
    "outputs": [{"internalType": "uint256", "name": "amount0", "type": "uint256"}, {
        "internalType": "uint256",
        "name": "amount1",
        "type": "uint256"
    }],
    "stateMutability": "view",
    "type": "function"
}, {
    "inputs": [{"internalType": "uint256", "name": "_shares", "type": "uint256"}, {
        "internalType": "uint256",
        "name": "_amount0Min",
        "type": "uint256"
    }, {"internalType": "uint256", "name": "_amount1Min", "type": "uint256"}],
    "name": "withdraw",
    "outputs": [{"internalType": "uint256", "name": "withdrawnAmount0", "type": "uint256"}, {
        "internalType": "uint256",
        "name": "withdrawnAmount1",
        "type": "uint256"
    }],
    "stateMutability": "nonpayable",
    "type": "function"
}]

module.exports = {
    TEAHOUSE_VAULT_V3_ABI
}
