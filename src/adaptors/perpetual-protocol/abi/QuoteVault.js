module.exports = [
    {
        "anonymous": false,
        "inputs":
            [
                {
                    "indexed": true,
                    "internalType": "address",
                    "name": "keeper",
                    "type": "address"
                },
                {
                    "indexed": true,
                    "internalType": "address",
                    "name": "baseToken",
                    "type": "address"
                },
                {
                    "indexed": false,
                    "internalType": "uint256",
                    "name": "reducedPositionSizeAbs",
                    "type": "uint256"
                },
                {
                    "indexed": false,
                    "internalType": "uint256",
                    "name": "base",
                    "type": "uint256"
                },
                {
                    "indexed": false,
                    "internalType": "uint256",
                    "name": "quote",
                    "type": "uint256"
                },
                {
                    "indexed": false,
                    "internalType": "uint256",
                    "name": "soldSpotNotional",
                    "type": "uint256"
                }
            ],
        "name": "Deleverage",
        "type": "event"
    },
    {
        "anonymous": false,
        "inputs":
            [
                {
                    "indexed": true,
                    "internalType": "address",
                    "name": "sender",
                    "type": "address"
                },
                {
                    "indexed": false,
                    "internalType": "uint256",
                    "name": "assets",
                    "type": "uint256"
                },
                {
                    "indexed": false,
                    "internalType": "uint256",
                    "name": "shares",
                    "type": "uint256"
                }
            ],
        "name": "Deposit",
        "type": "event"
    },
    {
        "anonymous": false,
        "inputs":
            [
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
        "inputs":
            [
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
        "inputs":
            [
                {
                    "indexed": true,
                    "internalType": "address",
                    "name": "sender",
                    "type": "address"
                },
                {
                    "indexed": false,
                    "internalType": "uint256",
                    "name": "assets",
                    "type": "uint256"
                },
                {
                    "indexed": false,
                    "internalType": "uint256",
                    "name": "shares",
                    "type": "uint256"
                }
            ],
        "name": "Redeem",
        "type": "event"
    },
    {
        "anonymous": false,
        "inputs":
            [
                {
                    "indexed": true,
                    "internalType": "address",
                    "name": "sender",
                    "type": "address"
                },
                {
                    "indexed": false,
                    "internalType": "address",
                    "name": "tokenIn",
                    "type": "address"
                },
                {
                    "indexed": false,
                    "internalType": "address",
                    "name": "tokenOut",
                    "type": "address"
                },
                {
                    "indexed": false,
                    "internalType": "uint256",
                    "name": "amountIn",
                    "type": "uint256"
                },
                {
                    "indexed": false,
                    "internalType": "uint256",
                    "name": "amountOut",
                    "type": "uint256"
                },
                {
                    "indexed": true,
                    "internalType": "address",
                    "name": "to",
                    "type": "address"
                }
            ],
        "name": "Swap",
        "type": "event"
    },
    {
        "anonymous": false,
        "inputs":
            [
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
        "inputs":
            [
                {
                    "indexed": false,
                    "internalType": "address",
                    "name": "oldBaseUsdPriceFeed",
                    "type": "address"
                },
                {
                    "indexed": false,
                    "internalType": "address",
                    "name": "newBaseUsdPriceFeed",
                    "type": "address"
                }
            ],
        "name": "UpdateBaseUsdPriceFeed",
        "type": "event"
    },
    {
        "anonymous": false,
        "inputs":
            [
                {
                    "indexed": false,
                    "internalType": "address",
                    "name": "oldQuoteUsdPriceFeed",
                    "type": "address"
                },
                {
                    "indexed": false,
                    "internalType": "address",
                    "name": "newQuoteUsdPriceFeed",
                    "type": "address"
                }
            ],
        "name": "UpdateQuoteUsdPriceFeed",
        "type": "event"
    },
    {
        "anonymous": false,
        "inputs":
            [
                {
                    "indexed": false,
                    "internalType": "address",
                    "name": "oldRouter",
                    "type": "address"
                },
                {
                    "indexed": false,
                    "internalType": "address",
                    "name": "newRouter",
                    "type": "address"
                }
            ],
        "name": "UpdateRouterAddress",
        "type": "event"
    },
    {
        "inputs":
            [],
        "name": "candidate",
        "outputs":
            [
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
        "inputs":
            [
                {
                    "internalType": "uint256",
                    "name": "reducedPositionSize",
                    "type": "uint256"
                }
            ],
        "name": "deleverage",
        "outputs":
            [],
        "stateMutability": "nonpayable",
        "type": "function"
    },
    {
        "inputs":
            [
                {
                    "internalType": "uint256",
                    "name": "assets",
                    "type": "uint256"
                }
            ],
        "name": "deposit",
        "outputs":
            [
                {
                    "internalType": "uint256",
                    "name": "",
                    "type": "uint256"
                }
            ],
        "stateMutability": "nonpayable",
        "type": "function"
    },
    {
        "inputs":
            [],
        "name": "getBaseToken",
        "outputs":
            [
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
        "inputs":
            [],
        "name": "getBaseUsdPriceFeed",
        "outputs":
            [
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
        "inputs":
            [],
        "name": "getIndexPrice",
        "outputs":
            [
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
        "inputs":
            [],
        "name": "getQuoteToken",
        "outputs":
            [
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
        "inputs":
            [],
        "name": "getQuoteUsdPriceFeed",
        "outputs":
            [
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
        "inputs":
            [],
        "name": "getRouter",
        "outputs":
            [
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
        "inputs":
            [],
        "name": "getVaultConfig",
        "outputs":
            [
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
        "inputs":
            [
                {
                    "internalType": "address",
                    "name": "vaultTokenArg",
                    "type": "address"
                },
                {
                    "internalType": "address",
                    "name": "quoteTokenArg",
                    "type": "address"
                },
                {
                    "internalType": "address",
                    "name": "baseTokenArg",
                    "type": "address"
                },
                {
                    "internalType": "address",
                    "name": "vaultConfigArg",
                    "type": "address"
                },
                {
                    "internalType": "address",
                    "name": "perpPositionManagerArg",
                    "type": "address"
                }
            ],
        "name": "initialize",
        "outputs":
            [],
        "stateMutability": "nonpayable",
        "type": "function"
    },
    {
        "inputs":
            [],
        "name": "owner",
        "outputs":
            [
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
        "inputs":
            [],
        "name": "pause",
        "outputs":
            [],
        "stateMutability": "nonpayable",
        "type": "function"
    },
    {
        "inputs":
            [],
        "name": "paused",
        "outputs":
            [
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
        "inputs":
            [
                {
                    "internalType": "uint256",
                    "name": "shares",
                    "type": "uint256"
                },
                {
                    "internalType": "uint256",
                    "name": "minRedeemedAmount",
                    "type": "uint256"
                }
            ],
        "name": "redeem",
        "outputs":
            [
                {
                    "internalType": "uint256",
                    "name": "redeemed",
                    "type": "uint256"
                }
            ],
        "stateMutability": "nonpayable",
        "type": "function"
    },
    {
        "inputs":
            [],
        "name": "renounceOwnership",
        "outputs":
            [],
        "stateMutability": "nonpayable",
        "type": "function"
    },
    {
        "inputs":
            [
                {
                    "internalType": "address",
                    "name": "baseUsdPriceFeedArg",
                    "type": "address"
                }
            ],
        "name": "setBaseUsdPriceFeed",
        "outputs":
            [],
        "stateMutability": "nonpayable",
        "type": "function"
    },
    {
        "inputs":
            [
                {
                    "internalType": "address",
                    "name": "newOwner",
                    "type": "address"
                }
            ],
        "name": "setOwner",
        "outputs":
            [],
        "stateMutability": "nonpayable",
        "type": "function"
    },
    {
        "inputs":
            [
                {
                    "internalType": "address",
                    "name": "quoteUsdPriceFeedArg",
                    "type": "address"
                }
            ],
        "name": "setQuoteUsdPriceFeed",
        "outputs":
            [],
        "stateMutability": "nonpayable",
        "type": "function"
    },
    {
        "inputs":
            [
                {
                    "internalType": "address",
                    "name": "routerArg",
                    "type": "address"
                }
            ],
        "name": "setRouter",
        "outputs":
            [],
        "stateMutability": "nonpayable",
        "type": "function"
    },
    {
        "inputs":
            [
                {
                    "components":
                        [
                            {
                                "internalType": "address",
                                "name": "tokenIn",
                                "type": "address"
                            },
                            {
                                "internalType": "address",
                                "name": "tokenOut",
                                "type": "address"
                            },
                            {
                                "internalType": "address",
                                "name": "recipient",
                                "type": "address"
                            },
                            {
                                "internalType": "uint256",
                                "name": "deadline",
                                "type": "uint256"
                            },
                            {
                                "internalType": "uint256",
                                "name": "amountIn",
                                "type": "uint256"
                            },
                            {
                                "internalType": "uint256",
                                "name": "amountOutMinimum",
                                "type": "uint256"
                            },
                            {
                                "internalType": "uint160",
                                "name": "sqrtPriceLimitX96OnPerp",
                                "type": "uint160"
                            }
                        ],
                    "internalType": "struct ICommonVaultStruct.SwapExactInputParams",
                    "name": "params",
                    "type": "tuple"
                }
            ],
        "name": "swapExactInput",
        "outputs":
            [
                {
                    "internalType": "uint256",
                    "name": "amountOut",
                    "type": "uint256"
                }
            ],
        "stateMutability": "nonpayable",
        "type": "function"
    },
    {
        "inputs":
            [
                {
                    "components":
                        [
                            {
                                "internalType": "address",
                                "name": "tokenIn",
                                "type": "address"
                            },
                            {
                                "internalType": "address",
                                "name": "tokenOut",
                                "type": "address"
                            },
                            {
                                "internalType": "address",
                                "name": "recipient",
                                "type": "address"
                            },
                            {
                                "internalType": "uint256",
                                "name": "deadline",
                                "type": "uint256"
                            },
                            {
                                "internalType": "uint256",
                                "name": "amountOut",
                                "type": "uint256"
                            },
                            {
                                "internalType": "uint256",
                                "name": "amountInMaximum",
                                "type": "uint256"
                            },
                            {
                                "internalType": "uint160",
                                "name": "sqrtPriceLimitX96OnPerp",
                                "type": "uint160"
                            }
                        ],
                    "internalType": "struct ICommonVaultStruct.SwapExactOutputParams",
                    "name": "params",
                    "type": "tuple"
                }
            ],
        "name": "swapExactOutput",
        "outputs":
            [
                {
                    "internalType": "uint256",
                    "name": "",
                    "type": "uint256"
                }
            ],
        "stateMutability": "nonpayable",
        "type": "function"
    },
    {
        "inputs":
            [],
        "name": "totalAssets",
        "outputs":
            [
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
        "inputs":
            [],
        "name": "unpause",
        "outputs":
            [],
        "stateMutability": "nonpayable",
        "type": "function"
    },
    {
        "inputs":
            [],
        "name": "updateOwner",
        "outputs":
            [],
        "stateMutability": "nonpayable",
        "type": "function"
    }
]