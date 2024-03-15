const TEAHOUSE_VAULT_MANAGED_ABI = [{
    "inputs": [{
        "internalType": "string",
        "name": "_name",
        "type": "string"
    }, {"internalType": "string", "name": "_symbol", "type": "string"}, {
        "internalType": "address",
        "name": "_weth9",
        "type": "address"
    }, {"internalType": "uint128", "name": "_priceNumerator", "type": "uint128"}, {
        "internalType": "uint128",
        "name": "_priceDenominator",
        "type": "uint128"
    }, {"internalType": "uint64", "name": "_startTimestamp", "type": "uint64"}, {
        "internalType": "address",
        "name": "_initialAdmin",
        "type": "address"
    }], "stateMutability": "nonpayable", "type": "constructor"
}, {"inputs": [], "name": "AssetNotWETH9", "type": "error"}, {
    "inputs": [],
    "name": "CancelDepositDisabled",
    "type": "error"
}, {"inputs": [], "name": "CancelWithdrawDisabled", "type": "error"}, {
    "inputs": [],
    "name": "DepositDisabled",
    "type": "error"
}, {"inputs": [], "name": "ExceedDepositLimit", "type": "error"}, {
    "inputs": [],
    "name": "FundIsClosed",
    "type": "error"
}, {"inputs": [], "name": "FundIsNotClosed", "type": "error"}, {
    "inputs": [],
    "name": "FundingLocked",
    "type": "error"
}, {"inputs": [], "name": "IncorrectCycleIndex", "type": "error"}, {
    "inputs": [],
    "name": "IncorrectCycleStartTimestamp",
    "type": "error"
}, {"inputs": [], "name": "IncorrectETHAmount", "type": "error"}, {
    "inputs": [],
    "name": "IncorrectVaultAddress",
    "type": "error"
}, {"inputs": [], "name": "InvalidFeePercentage", "type": "error"}, {
    "inputs": [],
    "name": "InvalidFundValue",
    "type": "error"
}, {"inputs": [], "name": "InvalidInitialPrice", "type": "error"}, {
    "inputs": [],
    "name": "NoDeposits",
    "type": "error"
}, {"inputs": [], "name": "NotAcceptingETH", "type": "error"}, {
    "inputs": [],
    "name": "NotEnoughAssets",
    "type": "error"
}, {"inputs": [], "name": "NotEnoughDeposits", "type": "error"}, {
    "inputs": [],
    "name": "NotEnoughWithdrawals",
    "type": "error"
}, {"inputs": [], "name": "OnlyAvailableToAdmins", "type": "error"}, {
    "inputs": [],
    "name": "OnlyAvailableToAuditors",
    "type": "error"
}, {"inputs": [], "name": "ReceiverDoNotHasNFT", "type": "error"}, {
    "inputs": [],
    "name": "WithdrawDisabled",
    "type": "error"
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
    "inputs": [{"indexed": true, "internalType": "address", "name": "caller", "type": "address"}, {
        "indexed": true,
        "internalType": "address",
        "name": "receiver",
        "type": "address"
    }, {"indexed": false, "internalType": "uint256", "name": "assets", "type": "uint256"}],
    "name": "ClaimOwedAssets",
    "type": "event"
}, {
    "anonymous": false,
    "inputs": [{"indexed": true, "internalType": "address", "name": "caller", "type": "address"}, {
        "indexed": true,
        "internalType": "address",
        "name": "receiver",
        "type": "address"
    }, {"indexed": false, "internalType": "uint256", "name": "shares", "type": "uint256"}],
    "name": "ClaimOwedShares",
    "type": "event"
}, {
    "anonymous": false,
    "inputs": [{"indexed": true, "internalType": "address", "name": "owner", "type": "address"}, {
        "indexed": true,
        "internalType": "uint32",
        "name": "cycleIndex",
        "type": "uint32"
    }, {"indexed": false, "internalType": "uint256", "name": "shares", "type": "uint256"}, {
        "indexed": false,
        "internalType": "uint256",
        "name": "assets",
        "type": "uint256"
    }],
    "name": "ConvertToAssets",
    "type": "event"
}, {
    "anonymous": false,
    "inputs": [{"indexed": true, "internalType": "address", "name": "owner", "type": "address"}, {
        "indexed": true,
        "internalType": "uint32",
        "name": "cycleIndex",
        "type": "uint32"
    }, {"indexed": false, "internalType": "uint256", "name": "assets", "type": "uint256"}, {
        "indexed": false,
        "internalType": "uint256",
        "name": "shares",
        "type": "uint256"
    }],
    "name": "ConvertToShares",
    "type": "event"
}, {
    "anonymous": false,
    "inputs": [{"indexed": true, "internalType": "address", "name": "caller", "type": "address"}, {
        "indexed": true,
        "internalType": "uint32",
        "name": "cycleIndex",
        "type": "uint32"
    }, {"indexed": true, "internalType": "address", "name": "receiver", "type": "address"}, {
        "indexed": false,
        "internalType": "uint256",
        "name": "assets",
        "type": "uint256"
    }],
    "name": "DepositCanceled",
    "type": "event"
}, {
    "anonymous": false,
    "inputs": [{"indexed": true, "internalType": "address", "name": "caller", "type": "address"}, {
        "indexed": true,
        "internalType": "uint32",
        "name": "cycleIndex",
        "type": "uint32"
    }, {"indexed": false, "internalType": "uint256", "name": "depositLimit", "type": "uint256"}],
    "name": "DepositLimitUpdated",
    "type": "event"
}, {
    "anonymous": false,
    "inputs": [{"indexed": true, "internalType": "address", "name": "caller", "type": "address"}, {
        "indexed": true,
        "internalType": "uint32",
        "name": "cycleIndex",
        "type": "uint32"
    }, {"indexed": true, "internalType": "address", "name": "receiver", "type": "address"}, {
        "indexed": false,
        "internalType": "uint256",
        "name": "assets",
        "type": "uint256"
    }],
    "name": "DepositRequested",
    "type": "event"
}, {
    "anonymous": false,
    "inputs": [{"indexed": true, "internalType": "address", "name": "caller", "type": "address"}, {
        "indexed": true,
        "internalType": "uint32",
        "name": "cycleIndex",
        "type": "uint32"
    }, {"indexed": false, "internalType": "address", "name": "teaVaultV2", "type": "address"}, {
        "indexed": false,
        "internalType": "uint256",
        "name": "value",
        "type": "uint256"
    }],
    "name": "DepositToVault",
    "type": "event"
}, {
    "anonymous": false,
    "inputs": [{"indexed": true, "internalType": "address", "name": "caller", "type": "address"}, {
        "indexed": true,
        "internalType": "uint32",
        "name": "cycleIndex",
        "type": "uint32"
    }, {"indexed": false, "internalType": "bool", "name": "disableChecks", "type": "bool"}],
    "name": "DisableNFTChecks",
    "type": "event"
}, {
    "anonymous": false,
    "inputs": [{"indexed": true, "internalType": "address", "name": "caller", "type": "address"}, {
        "indexed": true,
        "internalType": "uint32",
        "name": "cycleIndex",
        "type": "uint32"
    }, {"indexed": false, "internalType": "uint256", "name": "fundValue", "type": "uint256"}, {
        "indexed": false,
        "internalType": "uint256",
        "name": "priceNumerator",
        "type": "uint256"
    }, {"indexed": false, "internalType": "uint256", "name": "priceDenominator", "type": "uint256"}, {
        "indexed": false,
        "internalType": "uint256",
        "name": "depositLimit",
        "type": "uint256"
    }, {"indexed": false, "internalType": "uint64", "name": "startTimestamp", "type": "uint64"}, {
        "indexed": false,
        "internalType": "uint64",
        "name": "lockTimestamp",
        "type": "uint64"
    }, {"indexed": false, "internalType": "bool", "name": "fundClosed", "type": "bool"}, {
        "indexed": false,
        "internalType": "uint256",
        "name": "platformFee",
        "type": "uint256"
    }, {"indexed": false, "internalType": "uint256", "name": "managerFee", "type": "uint256"}],
    "name": "EnterNextCycle",
    "type": "event"
}, {
    "anonymous": false,
    "inputs": [{"indexed": true, "internalType": "address", "name": "caller", "type": "address"}, {
        "indexed": true,
        "internalType": "uint32",
        "name": "cycleIndex",
        "type": "uint32"
    }, {
        "components": [{
            "internalType": "address",
            "name": "platformVault",
            "type": "address"
        }, {"internalType": "address", "name": "managerVault", "type": "address"}, {
            "internalType": "uint24",
            "name": "platformEntryFee",
            "type": "uint24"
        }, {"internalType": "uint24", "name": "managerEntryFee", "type": "uint24"}, {
            "internalType": "uint24",
            "name": "platformExitFee",
            "type": "uint24"
        }, {"internalType": "uint24", "name": "managerExitFee", "type": "uint24"}, {
            "internalType": "uint24",
            "name": "platformPerformanceFee",
            "type": "uint24"
        }, {"internalType": "uint24", "name": "managerPerformanceFee", "type": "uint24"}, {
            "internalType": "uint24",
            "name": "platformManagementFee",
            "type": "uint24"
        }, {"internalType": "uint24", "name": "managerManagementFee", "type": "uint24"}],
        "indexed": false,
        "internalType": "struct IHighTableVault.FeeConfig",
        "name": "feeConfig",
        "type": "tuple"
    }],
    "name": "FeeConfigChanged",
    "type": "event"
}, {
    "anonymous": false,
    "inputs": [{"indexed": true, "internalType": "address", "name": "caller", "type": "address"}, {
        "indexed": false,
        "internalType": "uint256",
        "name": "priceNumerator",
        "type": "uint256"
    }, {"indexed": false, "internalType": "uint256", "name": "priceDenominator", "type": "uint256"}, {
        "indexed": false,
        "internalType": "uint64",
        "name": "startTimestamp",
        "type": "uint64"
    }, {"indexed": false, "internalType": "address", "name": "admin", "type": "address"}],
    "name": "FundInitialized",
    "type": "event"
}, {
    "anonymous": false,
    "inputs": [{"indexed": true, "internalType": "address", "name": "caller", "type": "address"}, {
        "indexed": true,
        "internalType": "uint32",
        "name": "cycleIndex",
        "type": "uint32"
    }, {"indexed": false, "internalType": "uint64", "name": "lockTimestamp", "type": "uint64"}],
    "name": "FundLockingTimestampUpdated",
    "type": "event"
}, {
    "anonymous": false,
    "inputs": [{"indexed": true, "internalType": "address", "name": "caller", "type": "address"}, {
        "indexed": true,
        "internalType": "uint32",
        "name": "cycleIndex",
        "type": "uint32"
    }, {"indexed": false, "internalType": "bool", "name": "disableDepositing", "type": "bool"}, {
        "indexed": false,
        "internalType": "bool",
        "name": "disableWithdrawing",
        "type": "bool"
    }, {"indexed": false, "internalType": "bool", "name": "disableCancelDepositing", "type": "bool"}, {
        "indexed": false,
        "internalType": "bool",
        "name": "disableCancelWithdrawing",
        "type": "bool"
    }],
    "name": "FundingChanged",
    "type": "event"
}, {
    "anonymous": false,
    "inputs": [{"indexed": true, "internalType": "address", "name": "caller", "type": "address"}, {
        "indexed": true,
        "internalType": "uint32",
        "name": "cycleIndex",
        "type": "uint32"
    }, {"indexed": false, "internalType": "address[]", "name": "nfts", "type": "address[]"}],
    "name": "NFTEnabled",
    "type": "event"
}, {
    "anonymous": false,
    "inputs": [{"indexed": true, "internalType": "bytes32", "name": "role", "type": "bytes32"}, {
        "indexed": true,
        "internalType": "bytes32",
        "name": "previousAdminRole",
        "type": "bytes32"
    }, {"indexed": true, "internalType": "bytes32", "name": "newAdminRole", "type": "bytes32"}],
    "name": "RoleAdminChanged",
    "type": "event"
}, {
    "anonymous": false,
    "inputs": [{"indexed": true, "internalType": "bytes32", "name": "role", "type": "bytes32"}, {
        "indexed": true,
        "internalType": "address",
        "name": "account",
        "type": "address"
    }, {"indexed": true, "internalType": "address", "name": "sender", "type": "address"}],
    "name": "RoleGranted",
    "type": "event"
}, {
    "anonymous": false,
    "inputs": [{"indexed": true, "internalType": "bytes32", "name": "role", "type": "bytes32"}, {
        "indexed": true,
        "internalType": "address",
        "name": "account",
        "type": "address"
    }, {"indexed": true, "internalType": "address", "name": "sender", "type": "address"}],
    "name": "RoleRevoked",
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
    "inputs": [{"indexed": true, "internalType": "address", "name": "caller", "type": "address"}, {
        "indexed": true,
        "internalType": "uint32",
        "name": "cycleIndex",
        "type": "uint32"
    }, {"indexed": false, "internalType": "address", "name": "teaVaultV2", "type": "address"}],
    "name": "UpdateTeaVaultV2",
    "type": "event"
}, {
    "anonymous": false,
    "inputs": [{"indexed": true, "internalType": "address", "name": "caller", "type": "address"}, {
        "indexed": true,
        "internalType": "uint32",
        "name": "cycleIndex",
        "type": "uint32"
    }, {"indexed": false, "internalType": "address", "name": "teaVaultV2", "type": "address"}, {
        "indexed": false,
        "internalType": "uint256",
        "name": "value",
        "type": "uint256"
    }],
    "name": "WithdrawFromVault",
    "type": "event"
}, {
    "anonymous": false,
    "inputs": [{"indexed": true, "internalType": "address", "name": "caller", "type": "address"}, {
        "indexed": true,
        "internalType": "uint32",
        "name": "cycleIndex",
        "type": "uint32"
    }, {"indexed": true, "internalType": "address", "name": "receiver", "type": "address"}, {
        "indexed": false,
        "internalType": "uint256",
        "name": "shares",
        "type": "uint256"
    }],
    "name": "WithdrawalCanceled",
    "type": "event"
}, {
    "anonymous": false,
    "inputs": [{"indexed": true, "internalType": "address", "name": "caller", "type": "address"}, {
        "indexed": true,
        "internalType": "uint32",
        "name": "cycleIndex",
        "type": "uint32"
    }, {"indexed": true, "internalType": "address", "name": "owner", "type": "address"}, {
        "indexed": false,
        "internalType": "uint256",
        "name": "shares",
        "type": "uint256"
    }],
    "name": "WithdrawalRequested",
    "type": "event"
}, {
    "inputs": [],
    "name": "AUDITOR_ROLE",
    "outputs": [{"internalType": "bytes32", "name": "", "type": "bytes32"}],
    "stateMutability": "view",
    "type": "function"
}, {
    "inputs": [],
    "name": "DEFAULT_ADMIN_ROLE",
    "outputs": [{"internalType": "bytes32", "name": "", "type": "bytes32"}],
    "stateMutability": "view",
    "type": "function"
}, {
    "inputs": [],
    "name": "SECONDS_IN_A_YEAR",
    "outputs": [{"internalType": "uint256", "name": "", "type": "uint256"}],
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
    "name": "asset",
    "outputs": [{"internalType": "address", "name": "assetTokenAddress", "type": "address"}],
    "stateMutability": "view",
    "type": "function"
}, {
    "inputs": [{"internalType": "address", "name": "account", "type": "address"}],
    "name": "balanceOf",
    "outputs": [{"internalType": "uint256", "name": "", "type": "uint256"}],
    "stateMutability": "view",
    "type": "function"
}, {
    "inputs": [{"internalType": "uint256", "name": "_assets", "type": "uint256"}, {
        "internalType": "address",
        "name": "_receiver",
        "type": "address"
    }], "name": "cancelDeposit", "outputs": [], "stateMutability": "nonpayable", "type": "function"
}, {
    "inputs": [{"internalType": "uint256", "name": "_assets", "type": "uint256"}, {
        "internalType": "address payable",
        "name": "_receiver",
        "type": "address"
    }], "name": "cancelDepositETH", "outputs": [], "stateMutability": "nonpayable", "type": "function"
}, {
    "inputs": [{"internalType": "uint256", "name": "_shares", "type": "uint256"}, {
        "internalType": "address",
        "name": "_receiver",
        "type": "address"
    }], "name": "cancelWithdraw", "outputs": [], "stateMutability": "nonpayable", "type": "function"
}, {
    "inputs": [{"internalType": "uint256", "name": "_assets", "type": "uint256"}, {
        "internalType": "address",
        "name": "_receiver",
        "type": "address"
    }],
    "name": "claimAndRequestDeposit",
    "outputs": [{"internalType": "uint256", "name": "assets", "type": "uint256"}],
    "stateMutability": "nonpayable",
    "type": "function"
}, {
    "inputs": [{"internalType": "uint256", "name": "_assets", "type": "uint256"}, {
        "internalType": "address",
        "name": "_receiver",
        "type": "address"
    }],
    "name": "claimAndRequestDepositETH",
    "outputs": [{"internalType": "uint256", "name": "assets", "type": "uint256"}],
    "stateMutability": "payable",
    "type": "function"
}, {
    "inputs": [{"internalType": "uint256", "name": "_shares", "type": "uint256"}, {
        "internalType": "address",
        "name": "_owner",
        "type": "address"
    }],
    "name": "claimAndRequestWithdraw",
    "outputs": [{"internalType": "uint256", "name": "shares", "type": "uint256"}],
    "stateMutability": "nonpayable",
    "type": "function"
}, {
    "inputs": [{"internalType": "address", "name": "_receiver", "type": "address"}],
    "name": "claimOwedAssets",
    "outputs": [{"internalType": "uint256", "name": "assets", "type": "uint256"}],
    "stateMutability": "nonpayable",
    "type": "function"
}, {
    "inputs": [{"internalType": "address payable", "name": "_receiver", "type": "address"}],
    "name": "claimOwedAssetsETH",
    "outputs": [{"internalType": "uint256", "name": "assets", "type": "uint256"}],
    "stateMutability": "nonpayable",
    "type": "function"
}, {
    "inputs": [{"internalType": "address", "name": "_receiver", "type": "address"}],
    "name": "claimOwedFunds",
    "outputs": [{"internalType": "uint256", "name": "assets", "type": "uint256"}, {
        "internalType": "uint256",
        "name": "shares",
        "type": "uint256"
    }],
    "stateMutability": "nonpayable",
    "type": "function"
}, {
    "inputs": [{"internalType": "address payable", "name": "_receiver", "type": "address"}],
    "name": "claimOwedFundsETH",
    "outputs": [{"internalType": "uint256", "name": "assets", "type": "uint256"}, {
        "internalType": "uint256",
        "name": "shares",
        "type": "uint256"
    }],
    "stateMutability": "nonpayable",
    "type": "function"
}, {
    "inputs": [{"internalType": "address", "name": "_receiver", "type": "address"}],
    "name": "claimOwedShares",
    "outputs": [{"internalType": "uint256", "name": "shares", "type": "uint256"}],
    "stateMutability": "nonpayable",
    "type": "function"
}, {
    "inputs": [{"internalType": "uint256", "name": "_shares", "type": "uint256"}, {
        "internalType": "address",
        "name": "_owner",
        "type": "address"
    }],
    "name": "closePosition",
    "outputs": [{"internalType": "uint256", "name": "assets", "type": "uint256"}],
    "stateMutability": "nonpayable",
    "type": "function"
}, {
    "inputs": [{"internalType": "address", "name": "_receiver", "type": "address"}],
    "name": "closePositionAndClaim",
    "outputs": [{"internalType": "uint256", "name": "assets", "type": "uint256"}],
    "stateMutability": "nonpayable",
    "type": "function"
}, {
    "inputs": [{"internalType": "address payable", "name": "_receiver", "type": "address"}],
    "name": "closePositionAndClaimETH",
    "outputs": [{"internalType": "uint256", "name": "assets", "type": "uint256"}],
    "stateMutability": "nonpayable",
    "type": "function"
}, {
    "inputs": [],
    "name": "closePrice",
    "outputs": [{"internalType": "uint128", "name": "numerator", "type": "uint128"}, {
        "internalType": "uint128",
        "name": "denominator",
        "type": "uint128"
    }],
    "stateMutability": "view",
    "type": "function"
}, {
    "inputs": [{"internalType": "uint32", "name": "", "type": "uint32"}],
    "name": "cycleState",
    "outputs": [{"internalType": "uint128", "name": "totalFundValue", "type": "uint128"}, {
        "internalType": "uint128",
        "name": "fundValueAfterRequests",
        "type": "uint128"
    }, {"internalType": "uint128", "name": "requestedDeposits", "type": "uint128"}, {
        "internalType": "uint128",
        "name": "convertedDeposits",
        "type": "uint128"
    }, {"internalType": "uint128", "name": "requestedWithdrawals", "type": "uint128"}, {
        "internalType": "uint128",
        "name": "convertedWithdrawals",
        "type": "uint128"
    }],
    "stateMutability": "view",
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
    "inputs": [{"internalType": "uint256", "name": "_value", "type": "uint256"}],
    "name": "depositToVault",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
}, {
    "inputs": [{"internalType": "uint256", "name": "_value", "type": "uint256"}],
    "name": "depositToVaultETH",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
}, {
    "inputs": [{"internalType": "uint32", "name": "_cycleIndex", "type": "uint32"}, {
        "internalType": "uint128",
        "name": "_fundValue",
        "type": "uint128"
    }, {"internalType": "uint128", "name": "_depositLimit", "type": "uint128"}, {
        "internalType": "uint128",
        "name": "_withdrawAmount",
        "type": "uint128"
    }, {"internalType": "uint64", "name": "_cycleStartTimestamp", "type": "uint64"}, {
        "internalType": "uint64",
        "name": "_fundingLockTimestamp",
        "type": "uint64"
    }, {"internalType": "bool", "name": "_closeFund", "type": "bool"}],
    "name": "enterNextCycle",
    "outputs": [{"internalType": "uint256", "name": "platformFee", "type": "uint256"}, {
        "internalType": "uint256",
        "name": "managerFee",
        "type": "uint256"
    }],
    "stateMutability": "nonpayable",
    "type": "function"
}, {
    "inputs": [{"internalType": "uint32", "name": "_cycleIndex", "type": "uint32"}, {
        "internalType": "uint128",
        "name": "_fundValue",
        "type": "uint128"
    }, {"internalType": "uint128", "name": "_depositLimit", "type": "uint128"}, {
        "internalType": "uint128",
        "name": "_withdrawAmount",
        "type": "uint128"
    }, {"internalType": "uint64", "name": "_cycleStartTimestamp", "type": "uint64"}, {
        "internalType": "uint64",
        "name": "_fundingLockTimestamp",
        "type": "uint64"
    }, {"internalType": "bool", "name": "_closeFund", "type": "bool"}],
    "name": "enterNextCycleETH",
    "outputs": [{"internalType": "uint256", "name": "platformFee", "type": "uint256"}, {
        "internalType": "uint256",
        "name": "managerFee",
        "type": "uint256"
    }],
    "stateMutability": "nonpayable",
    "type": "function"
}, {
    "inputs": [],
    "name": "feeConfig",
    "outputs": [{"internalType": "address", "name": "platformVault", "type": "address"}, {
        "internalType": "address",
        "name": "managerVault",
        "type": "address"
    }, {"internalType": "uint24", "name": "platformEntryFee", "type": "uint24"}, {
        "internalType": "uint24",
        "name": "managerEntryFee",
        "type": "uint24"
    }, {"internalType": "uint24", "name": "platformExitFee", "type": "uint24"}, {
        "internalType": "uint24",
        "name": "managerExitFee",
        "type": "uint24"
    }, {"internalType": "uint24", "name": "platformPerformanceFee", "type": "uint24"}, {
        "internalType": "uint24",
        "name": "managerPerformanceFee",
        "type": "uint24"
    }, {"internalType": "uint24", "name": "platformManagementFee", "type": "uint24"}, {
        "internalType": "uint24",
        "name": "managerManagementFee",
        "type": "uint24"
    }],
    "stateMutability": "view",
    "type": "function"
}, {
    "inputs": [],
    "name": "fundConfig",
    "outputs": [{
        "internalType": "contract ITeaVaultV2",
        "name": "teaVaultV2",
        "type": "address"
    }, {"internalType": "bool", "name": "disableNFTChecks", "type": "bool"}, {
        "internalType": "bool",
        "name": "disableDepositing",
        "type": "bool"
    }, {"internalType": "bool", "name": "disableWithdrawing", "type": "bool"}, {
        "internalType": "bool",
        "name": "disableCancelDepositing",
        "type": "bool"
    }, {"internalType": "bool", "name": "disableCancelWithdrawing", "type": "bool"}],
    "stateMutability": "view",
    "type": "function"
}, {
    "inputs": [{"internalType": "bytes32", "name": "role", "type": "bytes32"}],
    "name": "getRoleAdmin",
    "outputs": [{"internalType": "bytes32", "name": "", "type": "bytes32"}],
    "stateMutability": "view",
    "type": "function"
}, {
    "inputs": [],
    "name": "globalState",
    "outputs": [{"internalType": "uint128", "name": "depositLimit", "type": "uint128"}, {
        "internalType": "uint128",
        "name": "lockedAssets",
        "type": "uint128"
    }, {"internalType": "uint32", "name": "cycleIndex", "type": "uint32"}, {
        "internalType": "uint64",
        "name": "cycleStartTimestamp",
        "type": "uint64"
    }, {"internalType": "uint64", "name": "fundingLockTimestamp", "type": "uint64"}, {
        "internalType": "bool",
        "name": "fundClosed",
        "type": "bool"
    }],
    "stateMutability": "view",
    "type": "function"
}, {
    "inputs": [{"internalType": "bytes32", "name": "role", "type": "bytes32"}, {
        "internalType": "address",
        "name": "account",
        "type": "address"
    }], "name": "grantRole", "outputs": [], "stateMutability": "nonpayable", "type": "function"
}, {
    "inputs": [{"internalType": "bytes32", "name": "role", "type": "bytes32"}, {
        "internalType": "address",
        "name": "account",
        "type": "address"
    }],
    "name": "hasRole",
    "outputs": [{"internalType": "bool", "name": "", "type": "bool"}],
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
    "inputs": [],
    "name": "initialPrice",
    "outputs": [{"internalType": "uint128", "name": "numerator", "type": "uint128"}, {
        "internalType": "uint128",
        "name": "denominator",
        "type": "uint128"
    }],
    "stateMutability": "view",
    "type": "function"
}, {
    "inputs": [],
    "name": "name",
    "outputs": [{"internalType": "string", "name": "", "type": "string"}],
    "stateMutability": "view",
    "type": "function"
}, {
    "inputs": [{"internalType": "uint256", "name": "", "type": "uint256"}],
    "name": "nftEnabled",
    "outputs": [{"internalType": "address", "name": "", "type": "address"}],
    "stateMutability": "view",
    "type": "function"
}, {
    "inputs": [{"internalType": "uint128", "name": "_fundValue", "type": "uint128"}, {
        "internalType": "uint64",
        "name": "_timestamp",
        "type": "uint64"
    }],
    "name": "previewNextCycle",
    "outputs": [{"internalType": "uint256", "name": "withdrawAmount", "type": "uint256"}],
    "stateMutability": "view",
    "type": "function"
}, {
    "inputs": [{"internalType": "bytes32", "name": "role", "type": "bytes32"}, {
        "internalType": "address",
        "name": "account",
        "type": "address"
    }], "name": "renounceRole", "outputs": [], "stateMutability": "nonpayable", "type": "function"
}, {
    "inputs": [{"internalType": "uint256", "name": "_assets", "type": "uint256"}, {
        "internalType": "address",
        "name": "_receiver",
        "type": "address"
    }], "name": "requestDeposit", "outputs": [], "stateMutability": "nonpayable", "type": "function"
}, {
    "inputs": [{"internalType": "uint256", "name": "_assets", "type": "uint256"}, {
        "internalType": "address",
        "name": "_receiver",
        "type": "address"
    }], "name": "requestDepositETH", "outputs": [], "stateMutability": "payable", "type": "function"
}, {
    "inputs": [{"internalType": "uint256", "name": "_shares", "type": "uint256"}, {
        "internalType": "address",
        "name": "_owner",
        "type": "address"
    }], "name": "requestWithdraw", "outputs": [], "stateMutability": "nonpayable", "type": "function"
}, {
    "inputs": [{"internalType": "address", "name": "_owner", "type": "address"}],
    "name": "requestedFunds",
    "outputs": [{"internalType": "uint256", "name": "assets", "type": "uint256"}, {
        "internalType": "uint256",
        "name": "shares",
        "type": "uint256"
    }],
    "stateMutability": "view",
    "type": "function"
}, {
    "inputs": [{"internalType": "bytes32", "name": "role", "type": "bytes32"}, {
        "internalType": "address",
        "name": "account",
        "type": "address"
    }], "name": "revokeRole", "outputs": [], "stateMutability": "nonpayable", "type": "function"
}, {
    "inputs": [{"internalType": "uint128", "name": "_depositLimit", "type": "uint128"}],
    "name": "setDepositLimit",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
}, {
    "inputs": [{"internalType": "bool", "name": "_disableDepositing", "type": "bool"}, {
        "internalType": "bool",
        "name": "_disableWithdrawing",
        "type": "bool"
    }, {"internalType": "bool", "name": "_disableCancelDepositing", "type": "bool"}, {
        "internalType": "bool",
        "name": "_disableCancelWithdrawing",
        "type": "bool"
    }], "name": "setDisableFunding", "outputs": [], "stateMutability": "nonpayable", "type": "function"
}, {
    "inputs": [{"internalType": "bool", "name": "_checks", "type": "bool"}],
    "name": "setDisableNFTChecks",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
}, {
    "inputs": [{"internalType": "address[]", "name": "_nfts", "type": "address[]"}],
    "name": "setEnabledNFTs",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
}, {
    "inputs": [{
        "components": [{
            "internalType": "address",
            "name": "platformVault",
            "type": "address"
        }, {"internalType": "address", "name": "managerVault", "type": "address"}, {
            "internalType": "uint24",
            "name": "platformEntryFee",
            "type": "uint24"
        }, {"internalType": "uint24", "name": "managerEntryFee", "type": "uint24"}, {
            "internalType": "uint24",
            "name": "platformExitFee",
            "type": "uint24"
        }, {"internalType": "uint24", "name": "managerExitFee", "type": "uint24"}, {
            "internalType": "uint24",
            "name": "platformPerformanceFee",
            "type": "uint24"
        }, {"internalType": "uint24", "name": "managerPerformanceFee", "type": "uint24"}, {
            "internalType": "uint24",
            "name": "platformManagementFee",
            "type": "uint24"
        }, {"internalType": "uint24", "name": "managerManagementFee", "type": "uint24"}],
        "internalType": "struct IHighTableVault.FeeConfig",
        "name": "_feeConfig",
        "type": "tuple"
    }], "name": "setFeeConfig", "outputs": [], "stateMutability": "nonpayable", "type": "function"
}, {
    "inputs": [{"internalType": "uint64", "name": "_fundLockingTimestamp", "type": "uint64"}],
    "name": "setFundLockingTimestamp",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
}, {
    "inputs": [{"internalType": "address", "name": "_teaVaultV2", "type": "address"}],
    "name": "setTeaVaultV2",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
}, {
    "inputs": [{"internalType": "bytes4", "name": "interfaceId", "type": "bytes4"}],
    "name": "supportsInterface",
    "outputs": [{"internalType": "bool", "name": "", "type": "bool"}],
    "stateMutability": "view",
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
    "inputs": [{"internalType": "address", "name": "", "type": "address"}],
    "name": "userState",
    "outputs": [{"internalType": "uint128", "name": "requestedDeposits", "type": "uint128"}, {
        "internalType": "uint128",
        "name": "owedShares",
        "type": "uint128"
    }, {"internalType": "uint128", "name": "requestedWithdrawals", "type": "uint128"}, {
        "internalType": "uint128",
        "name": "owedAssets",
        "type": "uint128"
    }, {"internalType": "uint32", "name": "requestCycleIndex", "type": "uint32"}],
    "stateMutability": "view",
    "type": "function"
}, {
    "inputs": [{"internalType": "uint256", "name": "_value", "type": "uint256"}],
    "name": "withdrawFromVault",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
}, {
    "inputs": [{"internalType": "uint256", "name": "_value", "type": "uint256"}],
    "name": "withdrawFromVaultETH",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
}, {"stateMutability": "payable", "type": "receive"}]

module.exports = {
    TEAHOUSE_VAULT_MANAGED_ABI
}
