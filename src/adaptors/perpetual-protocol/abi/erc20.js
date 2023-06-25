module.exports = [
    {
        "anonymous": false,
        "inputs":
            [
                {
                    "indexed": true,
                    "internalType": "address",
                    "name": "owner",
                    "type": "address"
                },
                {
                    "indexed": true,
                    "internalType": "address",
                    "name": "spender",
                    "type": "address"
                },
                {
                    "indexed": false,
                    "internalType": "uint256",
                    "name": "value",
                    "type": "uint256"
                }
            ],
        "name": "Approval",
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
                    "indexed": true,
                    "internalType": "address",
                    "name": "from",
                    "type": "address"
                },
                {
                    "indexed": true,
                    "internalType": "address",
                    "name": "to",
                    "type": "address"
                },
                {
                    "indexed": false,
                    "internalType": "uint256",
                    "name": "value",
                    "type": "uint256"
                }
            ],
        "name": "Transfer",
        "type": "event"
    },
    {
        "anonymous": false,
        "inputs":
            [
                {
                    "indexed": false,
                    "internalType": "address",
                    "name": "oldMinter",
                    "type": "address"
                },
                {
                    "indexed": false,
                    "internalType": "address",
                    "name": "newMinter",
                    "type": "address"
                }
            ],
        "name": "UpdateMinter",
        "type": "event"
    },
    {
        "anonymous": false,
        "inputs":
            [
                {
                    "indexed": false,
                    "internalType": "uint256",
                    "name": "oldTotalSupplyCap",
                    "type": "uint256"
                },
                {
                    "indexed": false,
                    "internalType": "uint256",
                    "name": "newTotalSupplyCap",
                    "type": "uint256"
                }
            ],
        "name": "UpdateTotalSupplyCap",
        "type": "event"
    },
    {
        "anonymous": false,
        "inputs":
            [
                {
                    "indexed": false,
                    "internalType": "uint24",
                    "name": "oldTransferCooldown",
                    "type": "uint24"
                },
                {
                    "indexed": false,
                    "internalType": "uint24",
                    "name": "newTransferCooldown",
                    "type": "uint24"
                }
            ],
        "name": "UpdateTransferCooldown",
        "type": "event"
    },
    {
        "inputs":
            [
                {
                    "internalType": "address",
                    "name": "owner",
                    "type": "address"
                },
                {
                    "internalType": "address",
                    "name": "spender",
                    "type": "address"
                }
            ],
        "name": "allowance",
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
            [
                {
                    "internalType": "address",
                    "name": "spender",
                    "type": "address"
                },
                {
                    "internalType": "uint256",
                    "name": "amount",
                    "type": "uint256"
                }
            ],
        "name": "approve",
        "outputs":
            [
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
        "inputs":
            [
                {
                    "internalType": "address",
                    "name": "account",
                    "type": "address"
                }
            ],
        "name": "balanceOf",
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
            [
                {
                    "internalType": "address",
                    "name": "account",
                    "type": "address"
                },
                {
                    "internalType": "uint256",
                    "name": "amount",
                    "type": "uint256"
                }
            ],
        "name": "burn",
        "outputs":
            [],
        "stateMutability": "nonpayable",
        "type": "function"
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
            [],
        "name": "decimals",
        "outputs":
            [
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
        "inputs":
            [
                {
                    "internalType": "address",
                    "name": "spender",
                    "type": "address"
                },
                {
                    "internalType": "uint256",
                    "name": "subtractedValue",
                    "type": "uint256"
                }
            ],
        "name": "decreaseAllowance",
        "outputs":
            [
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
        "inputs":
            [
                {
                    "internalType": "address",
                    "name": "account",
                    "type": "address"
                }
            ],
        "name": "getLastMintedAt",
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
        "name": "getMinter",
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
        "name": "getTotalSupplyCap",
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
        "name": "getTransferCooldown",
        "outputs":
            [
                {
                    "internalType": "uint24",
                    "name": "",
                    "type": "uint24"
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
                    "name": "spender",
                    "type": "address"
                },
                {
                    "internalType": "uint256",
                    "name": "addedValue",
                    "type": "uint256"
                }
            ],
        "name": "increaseAllowance",
        "outputs":
            [
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
        "inputs":
            [
                {
                    "internalType": "string",
                    "name": "nameArg",
                    "type": "string"
                },
                {
                    "internalType": "string",
                    "name": "symbolArg",
                    "type": "string"
                },
                {
                    "internalType": "uint8",
                    "name": "decimalsArg",
                    "type": "uint8"
                },
                {
                    "internalType": "uint24",
                    "name": "transferCoolDownArg",
                    "type": "uint24"
                },
                {
                    "internalType": "uint256",
                    "name": "totalSupplyCapArg",
                    "type": "uint256"
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
            [
                {
                    "internalType": "address",
                    "name": "account",
                    "type": "address"
                },
                {
                    "internalType": "uint256",
                    "name": "amount",
                    "type": "uint256"
                }
            ],
        "name": "mint",
        "outputs":
            [],
        "stateMutability": "nonpayable",
        "type": "function"
    },
    {
        "inputs":
            [],
        "name": "name",
        "outputs":
            [
                {
                    "internalType": "string",
                    "name": "",
                    "type": "string"
                }
            ],
        "stateMutability": "view",
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
                    "name": "minterArg",
                    "type": "address"
                }
            ],
        "name": "setMinter",
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
                    "internalType": "uint256",
                    "name": "totalSupplyCapArg",
                    "type": "uint256"
                }
            ],
        "name": "setTotalSupplyCap",
        "outputs":
            [],
        "stateMutability": "nonpayable",
        "type": "function"
    },
    {
        "inputs":
            [
                {
                    "internalType": "uint24",
                    "name": "transferCooldownArg",
                    "type": "uint24"
                }
            ],
        "name": "setTransferCooldown",
        "outputs":
            [],
        "stateMutability": "nonpayable",
        "type": "function"
    },
    {
        "inputs":
            [],
        "name": "symbol",
        "outputs":
            [
                {
                    "internalType": "string",
                    "name": "",
                    "type": "string"
                }
            ],
        "stateMutability": "view",
        "type": "function"
    },
    {
        "inputs":
            [],
        "name": "totalSupply",
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
            [
                {
                    "internalType": "address",
                    "name": "recipient",
                    "type": "address"
                },
                {
                    "internalType": "uint256",
                    "name": "amount",
                    "type": "uint256"
                }
            ],
        "name": "transfer",
        "outputs":
            [
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
        "inputs":
            [
                {
                    "internalType": "address",
                    "name": "sender",
                    "type": "address"
                },
                {
                    "internalType": "address",
                    "name": "recipient",
                    "type": "address"
                },
                {
                    "internalType": "uint256",
                    "name": "amount",
                    "type": "uint256"
                }
            ],
        "name": "transferFrom",
        "outputs":
            [
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
        "inputs":
            [],
        "name": "updateOwner",
        "outputs":
            [],
        "stateMutability": "nonpayable",
        "type": "function"
    }
]