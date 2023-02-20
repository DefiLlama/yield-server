module.exports = {
  UiPoolDataProviderABI: [
    {
      "inputs": [
        {
          "internalType": "contract ILendPoolAddressesProvider",
          "name": "provider",
          "type": "address"
        }
      ],
      "name": "getSimpleReservesData",
      "outputs": [
        {
          "components": [
            {
              "internalType": "address",
              "name": "underlyingAsset",
              "type": "address"
            },
            {
              "internalType": "string",
              "name": "name",
              "type": "string"
            },
            {
              "internalType": "string",
              "name": "symbol",
              "type": "string"
            },
            {
              "internalType": "uint256",
              "name": "decimals",
              "type": "uint256"
            },
            {
              "internalType": "uint256",
              "name": "reserveFactor",
              "type": "uint256"
            },
            {
              "internalType": "bool",
              "name": "borrowingEnabled",
              "type": "bool"
            },
            {
              "internalType": "bool",
              "name": "isActive",
              "type": "bool"
            },
            {
              "internalType": "bool",
              "name": "isFrozen",
              "type": "bool"
            },
            {
              "internalType": "uint128",
              "name": "liquidityIndex",
              "type": "uint128"
            },
            {
              "internalType": "uint128",
              "name": "variableBorrowIndex",
              "type": "uint128"
            },
            {
              "internalType": "uint128",
              "name": "liquidityRate",
              "type": "uint128"
            },
            {
              "internalType": "uint128",
              "name": "variableBorrowRate",
              "type": "uint128"
            },
            {
              "internalType": "uint40",
              "name": "lastUpdateTimestamp",
              "type": "uint40"
            },
            {
              "internalType": "address",
              "name": "uTokenAddress",
              "type": "address"
            },
            {
              "internalType": "address",
              "name": "debtTokenAddress",
              "type": "address"
            },
            {
              "internalType": "address",
              "name": "interestRateAddress",
              "type": "address"
            },
            {
              "internalType": "uint256",
              "name": "availableLiquidity",
              "type": "uint256"
            },
            {
              "internalType": "uint256",
              "name": "totalVariableDebt",
              "type": "uint256"
            },
            {
              "internalType": "uint256",
              "name": "priceInEth",
              "type": "uint256"
            },
            {
              "internalType": "uint256",
              "name": "variableRateSlope1",
              "type": "uint256"
            },
            {
              "internalType": "uint256",
              "name": "variableRateSlope2",
              "type": "uint256"
            }
          ],
          "internalType": "struct IUiPoolDataProvider.AggregatedReserveData[]",
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
          "internalType": "contract ILendPoolAddressesProvider",
          "name": "provider",
          "type": "address"
        }
      ],
      "name": "getSimpleNftsData",
      "outputs": [
        {
          "components": [
            {
              "internalType": "address",
              "name": "underlyingAsset",
              "type": "address"
            },
            {
              "internalType": "string",
              "name": "name",
              "type": "string"
            },
            {
              "internalType": "string",
              "name": "symbol",
              "type": "string"
            },
            {
              "internalType": "bool",
              "name": "isActive",
              "type": "bool"
            },
            {
              "internalType": "bool",
              "name": "isFrozen",
              "type": "bool"
            },
            {
              "internalType": "address",
              "name": "uNftAddress",
              "type": "address"
            },
            {
              "internalType": "uint256",
              "name": "totalCollateral",
              "type": "uint256"
            }
          ],
          "internalType": "struct IUiPoolDataProvider.AggregatedNftData[]",
          "name": "",
          "type": "tuple[]"
        }
      ],
      "stateMutability": "view",
      "type": "function"
    }
  ]
}
