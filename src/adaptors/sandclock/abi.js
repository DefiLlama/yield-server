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

const erc4626ABI = [
  ...erc20ABI,
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
    "name": "totalCollateral",
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
    "name": "totalDebt",
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
    "inputs": [
      {
        "internalType": "uint256",
        "name": "shares",
        "type": "uint256"
      }
    ],
    "name": "convertToAssets",
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

const scUSDCv2ABI = [
  {
    "inputs": [],
    "name": "usdcBalance",
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
    "name": "slippageTolerance",
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
  ...erc4626ABI
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

const wstethABI = [
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "_wstETHAmount",
        "type": "uint256"
      }
    ],
    "name": "getStETHByWstETH",
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

const priceConverterABI = [
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "_ethAmount",
        "type": "uint256"
      }
    ],
    "name": "ethToUsdc",
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
]

module.exports = {
  erc20ABI,
  erc4626ABI,
  scUSDCv2ABI,
  stabilityPoolABI,
  wstethABI,
  priceConverterABI,
};