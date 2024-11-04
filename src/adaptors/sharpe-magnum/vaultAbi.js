vaultAbi = [
    {
        "inputs": [],
        "name": "vaultsLeverage",
        "outputs": [
          {
            "internalType": "enum MagEth.Leverage",
            "name": "",
            "type": "uint8"
          }
        ],
        "stateMutability": "view",
        "type": "function"
    },
    {
      "inputs": [],
      "name": "getVaultsActualBalance",
      "outputs": [
        {
          "internalType": "uint256",
          "name": "amount",
          "type": "uint256"
        }
      ],
      "stateMutability": "view",
      "type": "function"
    }
]

module.exports = {vaultAbi}