const erc4626ABI = [
  {
    "inputs": [],
    "name": "totalAssets",
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
    "name": "totalSupply",
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
];

const erc20ABI = [
  {
    "constant": true,
    "inputs": [
      { 
        "internalType": "address",
        "name": "_owner", 
        "type": "address" 
      }
    ],
    "name": "balanceOf",
    "outputs": [
      { 
        "internalType": "uint256",
        "name": "balance", 
        "type": "uint256" 
      }
    ],
    "payable": false,
    "stateMutability": "view",
    "type": "function"
  },
];

const stabilityPoolABI = [
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "_depositor",
        "type": "address"
      }
    ],
    "name": "getDepositorLQTYGain",
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
];

module.exports = {
  erc4626ABI,
  erc20ABI,
  stabilityPoolABI,
};