const vaultABI = [
    {
        "inputs": [],
        "name": "totalUnderlying",
        "outputs": [
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
        "inputs": [],
        "name": "totalUnderlyingMinusSponsored",
        "outputs": [
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
        "inputs": [],
        "name": "totalShares",
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
];

const curveABI = [
    {
        "stateMutability":"view",
        "type":"function",
        "name":"get_best_rate",
        "inputs":[
          {
            "name":"_from",
            "type":"address"
          },
          {
            "name":"_to",
            "type":"address"
          },
          {
            "name":"_amount",
            "type":"uint256"
          }
        ],
        "outputs":[
          {
            "name":"",
            "type":"address"
          },
          {
            "name":"",
            "type":"uint256"
          }
        ],
    }
];

module.exports = {
    vaultABI,
    curveABI
};