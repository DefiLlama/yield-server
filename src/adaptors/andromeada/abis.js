const allPairsLength = {
  constant: true,
  inputs: [],
  name: 'allPairsLength',
  outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
  payable: false,
  stateMutability: 'view',
  type: 'function',
};

const allPools = {
  constant: true,
  inputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
  name: 'allPairs',
  outputs: [{ internalType: 'address', name: '', type: 'address' }],
  payable: false,
  stateMutability: 'view',
  type: 'function',
};

const getReserves = {
  inputs: [],
  name: 'getReserves',
  outputs: [
    {
      internalType: 'uint112',
      name: '_reserve0',
      type: 'uint112',
    },
    {
      internalType: 'uint112',
      name: '_reserve1',
      type: 'uint112',
    },
    {
      internalType: 'uint32',
      name: '_blockTimestampLast',
      type: 'uint32',
    },
  ],
  stateMutability: 'view',
  type: 'function',
};

const token0 = {
  inputs: [],
  name: 'token0',
  outputs: [
    {
      internalType: 'address',
      name: '',
      type: 'address',
    },
  ],
  stateMutability: 'view',
  type: 'function',
};

const token1 = {
  inputs: [],
  name: 'token1',
  outputs: [
    {
      internalType: 'address',
      name: '',
      type: 'address',
    },
  ],
  stateMutability: 'view',
  type: 'function',
};

const rewardRate = {
  inputs: [
    {
      internalType: 'address',
      name: '',
      type: 'address',
    },
  ],
  name: 'rewardRate',
  outputs: [
    {
      internalType: 'uint256',
      name: '',
      type: 'uint256',
    },
  ],
  stateMutability: 'view',
  type: 'function',
};

const chainlinkLatestAnswer = {
  inputs: [],
  name: 'latestAnswer',
  outputs: [{ internalType: 'int256', name: '', type: 'int256' }],
  stateMutability: 'view',
  type: 'function',
};

module.exports = {
  allPairsLength,
  allPools,
  getReserves,
  token0,
  token1,
  rewardRate,
  chainlinkLatestAnswer,
};
