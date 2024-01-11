module.exports = [{
  "inputs": [{
    "internalType": "address",
    "name": "_plutusVaultRegistry",
    "type": "address"
  }, { "internalType": "address", "name": "_plvGlp", "type": "address" }, {
    "internalType": "address",
    "name": "_borrowPositionProxy",
    "type": "address"
  }, { "internalType": "address", "name": "_userVaultImplementation", "type": "address" }, {
    "internalType": "address",
    "name": "_dolomiteMargin",
    "type": "address"
  }], "stateMutability": "nonpayable", "type": "constructor"
}, {
  "anonymous": false,
  "inputs": [{ "indexed": true, "internalType": "address", "name": "owner", "type": "address" }, {
    "indexed": true,
    "internalType": "address",
    "name": "spender",
    "type": "address"
  }, { "indexed": false, "internalType": "uint256", "name": "value", "type": "uint256" }],
  "name": "Approval",
  "type": "event"
}, { "anonymous": false, "inputs": [], "name": "Initialized", "type": "event" }, {
  "anonymous": false,
  "inputs": [{ "indexed": false, "internalType": "address", "name": "_plutusVaultRegistry", "type": "address" }],
  "name": "PlutusVaultRegistrySet",
  "type": "event"
}, {
  "anonymous": false,
  "inputs": [{
    "indexed": true,
    "internalType": "address",
    "name": "tokenConverter",
    "type": "address"
  }, { "indexed": false, "internalType": "bool", "name": "isTrusted", "type": "bool" }],
  "name": "TokenConverterSet",
  "type": "event"
}, {
  "anonymous": false,
  "inputs": [{ "indexed": true, "internalType": "address", "name": "from", "type": "address" }, {
    "indexed": true,
    "internalType": "address",
    "name": "to",
    "type": "address"
  }, { "indexed": false, "internalType": "uint256", "name": "value", "type": "uint256" }],
  "name": "Transfer",
  "type": "event"
}, {
  "anonymous": false,
  "inputs": [{
    "indexed": true,
    "internalType": "uint256",
    "name": "transferCursor",
    "type": "uint256"
  }, { "indexed": false, "internalType": "address", "name": "from", "type": "address" }, {
    "indexed": false,
    "internalType": "address",
    "name": "to",
    "type": "address"
  }, { "indexed": false, "internalType": "uint256", "name": "amountWei", "type": "uint256" }, {
    "indexed": false,
    "internalType": "address",
    "name": "vault",
    "type": "address"
  }],
  "name": "TransferQueued",
  "type": "event"
}, {
  "anonymous": false,
  "inputs": [{
    "indexed": true,
    "internalType": "address",
    "name": "previousUserVaultImplementation",
    "type": "address"
  }, { "indexed": true, "internalType": "address", "name": "newUserVaultImplementation", "type": "address" }],
  "name": "UserVaultImplementationSet",
  "type": "event"
}, {
  "anonymous": false,
  "inputs": [{ "indexed": true, "internalType": "address", "name": "account", "type": "address" }, {
    "indexed": false,
    "internalType": "address",
    "name": "vault",
    "type": "address"
  }],
  "name": "VaultCreated",
  "type": "event"
}, {
  "inputs": [],
  "name": "BORROW_POSITION_PROXY",
  "outputs": [{ "internalType": "contract IBorrowPositionProxyV2", "name": "", "type": "address" }],
  "stateMutability": "view",
  "type": "function"
}, {
  "inputs": [],
  "name": "DOLOMITE_MARGIN",
  "outputs": [{ "internalType": "contract IDolomiteMargin", "name": "", "type": "address" }],
  "stateMutability": "view",
  "type": "function"
}, {
  "inputs": [],
  "name": "NONE",
  "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
  "stateMutability": "view",
  "type": "function"
}, {
  "inputs": [],
  "name": "UNDERLYING_TOKEN",
  "outputs": [{ "internalType": "address", "name": "", "type": "address" }],
  "stateMutability": "view",
  "type": "function"
}, {
  "inputs": [],
  "name": "allowableCollateralMarketIds",
  "outputs": [{ "internalType": "uint256[]", "name": "", "type": "uint256[]" }],
  "stateMutability": "pure",
  "type": "function"
}, {
  "inputs": [],
  "name": "allowableDebtMarketIds",
  "outputs": [{ "internalType": "uint256[]", "name": "", "type": "uint256[]" }],
  "stateMutability": "pure",
  "type": "function"
}, {
  "inputs": [{ "internalType": "address", "name": "owner", "type": "address" }, {
    "internalType": "address",
    "name": "spender",
    "type": "address"
  }],
  "name": "allowance",
  "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
  "stateMutability": "view",
  "type": "function"
}, {
  "inputs": [{ "internalType": "address", "name": "spender", "type": "address" }, {
    "internalType": "uint256",
    "name": "amount",
    "type": "uint256"
  }],
  "name": "approve",
  "outputs": [{ "internalType": "bool", "name": "", "type": "bool" }],
  "stateMutability": "nonpayable",
  "type": "function"
}, {
  "inputs": [{ "internalType": "address", "name": "account", "type": "address" }],
  "name": "balanceOf",
  "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
  "stateMutability": "view",
  "type": "function"
}, {
  "inputs": [{ "internalType": "address", "name": "_account", "type": "address" }],
  "name": "calculateVaultByAccount",
  "outputs": [{ "internalType": "address", "name": "_vault", "type": "address" }],
  "stateMutability": "view",
  "type": "function"
}, {
  "inputs": [{ "internalType": "address", "name": "_account", "type": "address" }],
  "name": "createVault",
  "outputs": [{ "internalType": "address", "name": "", "type": "address" }],
  "stateMutability": "nonpayable",
  "type": "function"
}, {
  "inputs": [{
    "internalType": "uint256",
    "name": "_toAccountNumber",
    "type": "uint256"
  }, { "internalType": "uint256", "name": "_amountWei", "type": "uint256" }],
  "name": "createVaultAndDepositIntoDolomiteMargin",
  "outputs": [{ "internalType": "address", "name": "", "type": "address" }],
  "stateMutability": "nonpayable",
  "type": "function"
}, {
  "inputs": [],
  "name": "decimals",
  "outputs": [{ "internalType": "uint8", "name": "", "type": "uint8" }],
  "stateMutability": "view",
  "type": "function"
}, {
  "inputs": [{ "internalType": "address", "name": "spender", "type": "address" }, {
    "internalType": "uint256",
    "name": "subtractedValue",
    "type": "uint256"
  }],
  "name": "decreaseAllowance",
  "outputs": [{ "internalType": "bool", "name": "", "type": "bool" }],
  "stateMutability": "nonpayable",
  "type": "function"
}, {
  "inputs": [{
    "internalType": "uint256",
    "name": "_toAccountNumber",
    "type": "uint256"
  }, { "internalType": "uint256", "name": "_amountWei", "type": "uint256" }],
  "name": "depositIntoDolomiteMargin",
  "outputs": [],
  "stateMutability": "nonpayable",
  "type": "function"
}, {
  "inputs": [{
    "internalType": "uint256",
    "name": "_toAccountNumber",
    "type": "uint256"
  }, { "internalType": "uint256", "name": "_otherMarketId", "type": "uint256" }, {
    "internalType": "uint256",
    "name": "_amountWei",
    "type": "uint256"
  }],
  "name": "depositOtherTokenIntoDolomiteMarginForVaultOwner",
  "outputs": [],
  "stateMutability": "nonpayable",
  "type": "function"
}, {
  "inputs": [{ "internalType": "address", "name": "_vault", "type": "address" }, {
    "internalType": "uint256",
    "name": "_amountWei",
    "type": "uint256"
  }], "name": "enqueueTransferFromDolomiteMargin", "outputs": [], "stateMutability": "nonpayable", "type": "function"
}, {
  "inputs": [{ "internalType": "address", "name": "_vault", "type": "address" }, {
    "internalType": "uint256",
    "name": "_amountWei",
    "type": "uint256"
  }], "name": "enqueueTransferIntoDolomiteMargin", "outputs": [], "stateMutability": "nonpayable", "type": "function"
}, {
  "inputs": [{ "internalType": "address", "name": "_vault", "type": "address" }],
  "name": "getAccountByVault",
  "outputs": [{ "internalType": "address", "name": "_account", "type": "address" }],
  "stateMutability": "view",
  "type": "function"
}, {
  "inputs": [],
  "name": "getProxyVaultInitCodeHash",
  "outputs": [{ "internalType": "bytes32", "name": "", "type": "bytes32" }],
  "stateMutability": "pure",
  "type": "function"
}, {
  "inputs": [{ "internalType": "uint256", "name": "_transferCursor", "type": "uint256" }],
  "name": "getQueuedTransferByCursor",
  "outputs": [{
    "components": [{
      "internalType": "address",
      "name": "from",
      "type": "address"
    }, { "internalType": "address", "name": "to", "type": "address" }, {
      "internalType": "uint256",
      "name": "amount",
      "type": "uint256"
    }, { "internalType": "address", "name": "vault", "type": "address" }, {
      "internalType": "bool",
      "name": "isExecuted",
      "type": "bool"
    }], "internalType": "struct IWrappedTokenUserVaultFactory.QueuedTransfer", "name": "", "type": "tuple"
  }],
  "stateMutability": "view",
  "type": "function"
}, {
  "inputs": [{ "internalType": "address", "name": "_account", "type": "address" }],
  "name": "getVaultByAccount",
  "outputs": [{ "internalType": "address", "name": "_vault", "type": "address" }],
  "stateMutability": "view",
  "type": "function"
}, {
  "inputs": [{ "internalType": "address", "name": "spender", "type": "address" }, {
    "internalType": "uint256",
    "name": "addedValue",
    "type": "uint256"
  }],
  "name": "increaseAllowance",
  "outputs": [{ "internalType": "bool", "name": "", "type": "bool" }],
  "stateMutability": "nonpayable",
  "type": "function"
}, {
  "inputs": [],
  "name": "isInitialized",
  "outputs": [{ "internalType": "bool", "name": "", "type": "bool" }],
  "stateMutability": "view",
  "type": "function"
}, {
  "inputs": [],
  "name": "isIsolationAsset",
  "outputs": [{ "internalType": "bool", "name": "", "type": "bool" }],
  "stateMutability": "pure",
  "type": "function"
}, {
  "inputs": [{ "internalType": "address", "name": "_tokenConverter", "type": "address" }],
  "name": "isTokenConverterTrusted",
  "outputs": [{ "internalType": "bool", "name": "", "type": "bool" }],
  "stateMutability": "view",
  "type": "function"
}, {
  "inputs": [],
  "name": "marketId",
  "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
  "stateMutability": "view",
  "type": "function"
}, {
  "inputs": [],
  "name": "name",
  "outputs": [{ "internalType": "string", "name": "", "type": "string" }],
  "stateMutability": "view",
  "type": "function"
}, {
  "inputs": [{ "internalType": "address[]", "name": "_tokenConverters", "type": "address[]" }],
  "name": "ownerInitialize",
  "outputs": [],
  "stateMutability": "nonpayable",
  "type": "function"
}, {
  "inputs": [{ "internalType": "address", "name": "_tokenConverter", "type": "address" }, {
    "internalType": "bool",
    "name": "_isTrusted",
    "type": "bool"
  }], "name": "ownerSetIsTokenConverterTrusted", "outputs": [], "stateMutability": "nonpayable", "type": "function"
}, {
  "inputs": [{ "internalType": "address", "name": "_plutusVaultRegistry", "type": "address" }],
  "name": "ownerSetPlutusVaultRegistry",
  "outputs": [],
  "stateMutability": "nonpayable",
  "type": "function"
}, {
  "inputs": [{ "internalType": "address", "name": "_userVaultImplementation", "type": "address" }],
  "name": "ownerSetUserVaultImplementation",
  "outputs": [],
  "stateMutability": "nonpayable",
  "type": "function"
}, {
  "inputs": [],
  "name": "plutusVaultRegistry",
  "outputs": [{ "internalType": "contract IPlutusVaultRegistry", "name": "", "type": "address" }],
  "stateMutability": "view",
  "type": "function"
}, {
  "inputs": [],
  "name": "symbol",
  "outputs": [{ "internalType": "string", "name": "", "type": "string" }],
  "stateMutability": "view",
  "type": "function"
}, {
  "inputs": [],
  "name": "totalSupply",
  "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
  "stateMutability": "view",
  "type": "function"
}, {
  "inputs": [{ "internalType": "address", "name": "to", "type": "address" }, {
    "internalType": "uint256",
    "name": "amount",
    "type": "uint256"
  }],
  "name": "transfer",
  "outputs": [{ "internalType": "bool", "name": "", "type": "bool" }],
  "stateMutability": "nonpayable",
  "type": "function"
}, {
  "inputs": [],
  "name": "transferCursor",
  "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
  "stateMutability": "view",
  "type": "function"
}, {
  "inputs": [{ "internalType": "address", "name": "from", "type": "address" }, {
    "internalType": "address",
    "name": "to",
    "type": "address"
  }, { "internalType": "uint256", "name": "amount", "type": "uint256" }],
  "name": "transferFrom",
  "outputs": [{ "internalType": "bool", "name": "", "type": "bool" }],
  "stateMutability": "nonpayable",
  "type": "function"
}, {
  "inputs": [],
  "name": "userVaultImplementation",
  "outputs": [{ "internalType": "address", "name": "", "type": "address" }],
  "stateMutability": "view",
  "type": "function"
}, {
  "inputs": [{
    "internalType": "uint256",
    "name": "_fromAccountNumber",
    "type": "uint256"
  }, { "internalType": "uint256", "name": "_amountWei", "type": "uint256" }],
  "name": "withdrawFromDolomiteMargin",
  "outputs": [],
  "stateMutability": "nonpayable",
  "type": "function"
}];
