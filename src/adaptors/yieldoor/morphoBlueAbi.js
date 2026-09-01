const blueAbi = [
  {
    type: "function",
    name: "idToMarketParams",
    inputs: [
      {
        name: "",
        type: "bytes32",
        internalType: "Id",
      }
    ],
    outputs: [
      {
        name: "loanToken",
        type: "address",
        internalType: "address",
      },
      {
        name: "collateralToken",
        type: "address",
        internalType: "address",
      },
      {
        name: "oracle",
        type: "address",
        internalType: "address",
      },
      {
        name: "irm",
        type: "address",
        internalType: "address",
      },
      {
        name: "lltv",
        type: "uint256",
        internalType: "uint256",
      }
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "market",
    inputs: [
      {
        name: "",
        type: "bytes32",
        internalType: "Id",
      }
    ],
    outputs: [
      {
        name: "totalSupplyAssets",
        type: "uint128",
        internalType: "uint128",
      },
      {
        name: "totalSupplyShares",
        type: "uint128",
        internalType: "uint128",
      },
      {
        name: "totalBorrowAssets",
        type: "uint128",
        internalType: "uint128",
      },
      {
        name: "totalBorrowShares",
        type: "uint128",
        internalType: "uint128",
      },
      {
        name: "lastUpdate",
        type: "uint128",
        internalType: "uint128",
      },
      {
        name: "fee",
        type: "uint128",
        internalType: "uint128",
      }
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "position",
    inputs: [
      {
        name: "",
        type: "bytes32",
        internalType: "Id",
      },
      {
        name: "",
        type: "address",
        internalType: "address",
      }
    ],
    outputs: [
      {
        name: "supplyShares",
        type: "uint256",
        internalType: "uint256",
      },
      {
        name: "borrowShares",
        type: "uint128",
        internalType: "uint128",
      },
      {
        name: "collateral",
        type: "uint128",
        internalType: "uint128",
      }
    ],
    stateMutability: "view",
  }
];

const adaptiveCurveIrmAbi = [
  {
    inputs: [
      {
        internalType: "Id",
        name: "",
        type: "bytes32",
      }
    ],
    stateMutability: "view",
    type: "function",
    name: "rateAtTarget",
    outputs: [
      {
        internalType: "int256",
        name: "",
        type: "int256",
      }
  ],
}];

const blueOracleAbi = [
  {
    type: "function",
    name: "price",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "uint256",
        internalType: "uint256",
      }
    ],
    stateMutability: "view",
  }
];

module.exports = { blueAbi, adaptiveCurveIrmAbi, blueOracleAbi };