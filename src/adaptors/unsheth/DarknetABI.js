module.exports = [
  {
    "inputs": [
      {
        "internalType": "address[]",
        "name": "_lsds",
        "type": "address[]"
      },
      {
        "internalType": "bytes4[]",
        "name": "_links",
        "type": "bytes4[]"
      }
    ],
    "stateMutability": "nonpayable",
    "type": "constructor"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "lsd",
        "type": "address"
      }
    ],
    "name": "checkPrice",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  }
]