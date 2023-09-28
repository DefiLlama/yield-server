module.exports = {
  gammaFarmAbi: [
    {
      "inputs": [],
      "name": "GAMMAPerBlock",
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
          "name": "",
          "type": "uint256"
        }
      ],
      "name": "poolInfo",
      "outputs": [
        {
          "internalType": "uint256",
          "name": "allocPoint",
          "type": "uint256"
        },
        {
          "internalType": "uint256",
          "name": "lastRewardBlock",
          "type": "uint256"
        },
        {
          "internalType": "uint256",
          "name": "accGAMMAPerShare",
          "type": "uint256"
        },
        {
          "internalType": "uint256",
          "name": "accGAMMAPerFactorPerShare",
          "type": "uint256"
        },
        {
          "internalType": "uint256",
          "name": "gammaRewardBoostPercentage",
          "type": "uint256"
        },
        {
          "internalType": "uint256",
          "name": "totalFactor",
          "type": "uint256"
        },
        {
          "internalType": "contract IERC20",
          "name": "want",
          "type": "address"
        },
        {
          "internalType": "address",
          "name": "strat",
          "type": "address"
        },
        {
          "internalType": "address",
          "name": "gToken",
          "type": "address"
        },
        {
          "internalType": "address",
          "name": "iToken",
          "type": "address"
        },
        {
          "internalType": "bool",
          "name": "isInfinity",
          "type": "bool"
        },
        {
          "internalType": "bool",
          "name": "hasStratRewards",
          "type": "bool"
        },
        {
          "internalType": "bool",
          "name": "isBoosted",
          "type": "bool"
        }
      ],
      "stateMutability": "view",
      "type": "function"
    },
    {
      "inputs": [],
      "name": "poolLength",
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
      "name": "totalAllocPoint",
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
  ],
  lpTokenABI: [
    {
      constant: true,
      inputs: [{ internalType: 'address', name: '', type: 'address' }],
      name: 'balanceOf',
      outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
      payable: false,
      stateMutability: 'view',
      type: 'function',
    },
    {
      constant: true,
      inputs: [],
      name: 'getReserves',
      outputs: [
        { internalType: 'uint112', name: '_reserve0', type: 'uint112' },
        { internalType: 'uint112', name: '_reserve1', type: 'uint112' },
        { internalType: 'uint32', name: '_blockTimestampLast', type: 'uint32' },
      ],
      payable: false,
      stateMutability: 'view',
      type: 'function',
    },
    {
      constant: true,
      inputs: [],
      name: 'totalSupply',
      outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
      payable: false,
      stateMutability: 'view',
      type: 'function',
    },
  ],
  gammaReservoirAbi: [{
    "inputs": [],
    "name": "farmV2DripRate",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  }]
};
