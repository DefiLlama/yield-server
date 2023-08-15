module.exports = {
  'getAllPods': {"inputs":[],"name":"getAllPods","outputs":[{"internalType":"address[]","name":"","type":"address[]"}],"stateMutability":"view","type":"function"},
  'pods': {"inputs":[{"internalType":"address","name":"","type":"address"}],"name":"pods","outputs":[{"internalType":"address","name":"podAddress","type":"address"},{"internalType":"address","name":"podOwner","type":"address"},{"internalType":"address","name":"collateral","type":"address"},{"internalType":"uint96","name":"lastUpdate","type":"uint96"},{"internalType":"uint256","name":"lastIndex","type":"uint256"},{"internalType":"uint256","name":"rentedAmount","type":"uint256"},{"internalType":"uint256","name":"accruedFees","type":"uint256"}],"stateMutability":"view","type":"function"},
    'calculateDiscountRate': {"inputs":[{"internalType":"uint256","name":"debtBalance","type":"uint256"},{"internalType":"uint256","name":"discountTokenBalance","type":"uint256"}],"name":"calculateDiscountRate","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"pure","type":"function"},
    'mintFeeRatio': {"inputs":[],"name":"mintFeeRatio","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},
    'getGhoReserveData': {
        "inputs": [],
        "name": "getGhoReserveData",
        "outputs": [
          {
            "components": [
              {
                "internalType": "uint256",
                "name": "ghoBaseVariableBorrowRate",
                "type": "uint256"
              },
              {
                "internalType": "uint256",
                "name": "ghoDiscountedPerToken",
                "type": "uint256"
              },
              {
                "internalType": "uint256",
                "name": "ghoDiscountRate",
                "type": "uint256"
              },
              {
                "internalType": "uint256",
                "name": "ghoMinDebtTokenBalanceForDiscount",
                "type": "uint256"
              },
              {
                "internalType": "uint256",
                "name": "ghoMinDiscountTokenBalanceForDiscount",
                "type": "uint256"
              },
              {
                "internalType": "uint40",
                "name": "ghoReserveLastUpdateTimestamp",
                "type": "uint40"
              },
              {
                "internalType": "uint128",
                "name": "ghoCurrentBorrowIndex",
                "type": "uint128"
              },
              {
                "internalType": "uint256",
                "name": "aaveFacilitatorBucketLevel",
                "type": "uint256"
              },
              {
                "internalType": "uint256",
                "name": "aaveFacilitatorBucketMaxCapacity",
                "type": "uint256"
              }
            ],
            "internalType": "struct IUiGhoDataProvider.GhoReserveData",
            "name": "",
            "type": "tuple"
          }
        ],
        "stateMutability": "view",
        "type": "function"
      },
}