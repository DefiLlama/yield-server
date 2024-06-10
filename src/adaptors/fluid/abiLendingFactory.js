module.exports = [
  {
    inputs: [
      {
        internalType: 'contract IFluidLiquidity',
        name: 'liquidity_',
        type: 'address',
      },
      { internalType: 'address', name: 'owner_', type: 'address' },
    ],
    stateMutability: 'nonpayable',
    type: 'constructor',
  },
  {
    inputs: [{ internalType: 'uint256', name: 'errorId_', type: 'uint256' }],
    name: 'FluidLendingError',
    type: 'error',
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, internalType: 'address', name: 'auth', type: 'address' },
      { indexed: true, internalType: 'bool', name: 'allowed', type: 'bool' },
    ],
    name: 'LogSetAuth',
    type: 'event',
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: 'address',
        name: 'deployer',
        type: 'address',
      },
      { indexed: true, internalType: 'bool', name: 'allowed', type: 'bool' },
    ],
    name: 'LogSetDeployer',
    type: 'event',
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: 'string',
        name: 'fTokenType',
        type: 'string',
      },
      {
        indexed: true,
        internalType: 'address',
        name: 'creationCodePointer',
        type: 'address',
      },
    ],
    name: 'LogSetFTokenCreationCode',
    type: 'event',
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: 'address',
        name: 'token',
        type: 'address',
      },
      {
        indexed: true,
        internalType: 'address',
        name: 'asset',
        type: 'address',
      },
      {
        indexed: true,
        internalType: 'uint256',
        name: 'count',
        type: 'uint256',
      },
      {
        indexed: false,
        internalType: 'string',
        name: 'fTokenType',
        type: 'string',
      },
    ],
    name: 'LogTokenCreated',
    type: 'event',
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, internalType: 'address', name: 'user', type: 'address' },
      {
        indexed: true,
        internalType: 'address',
        name: 'newOwner',
        type: 'address',
      },
    ],
    name: 'OwnershipTransferred',
    type: 'event',
  },
  {
    inputs: [],
    name: 'LIQUIDITY',
    outputs: [
      { internalType: 'contract IFluidLiquidity', name: '', type: 'address' },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'allTokens',
    outputs: [{ internalType: 'address[]', name: '', type: 'address[]' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      { internalType: 'address', name: 'asset_', type: 'address' },
      { internalType: 'string', name: 'fTokenType_', type: 'string' },
    ],
    name: 'computeToken',
    outputs: [{ internalType: 'address', name: 'token_', type: 'address' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      { internalType: 'address', name: 'asset_', type: 'address' },
      { internalType: 'string', name: 'fTokenType_', type: 'string' },
      { internalType: 'bool', name: 'isNativeUnderlying_', type: 'bool' },
    ],
    name: 'createToken',
    outputs: [{ internalType: 'address', name: 'token_', type: 'address' }],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [{ internalType: 'string', name: 'fTokenType_', type: 'string' }],
    name: 'fTokenCreationCode',
    outputs: [{ internalType: 'bytes', name: '', type: 'bytes' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'fTokenTypes',
    outputs: [{ internalType: 'string[]', name: '', type: 'string[]' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ internalType: 'address', name: 'auth_', type: 'address' }],
    name: 'isAuth',
    outputs: [{ internalType: 'bool', name: '', type: 'bool' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ internalType: 'address', name: 'deployer_', type: 'address' }],
    name: 'isDeployer',
    outputs: [{ internalType: 'bool', name: '', type: 'bool' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'owner',
    outputs: [{ internalType: 'address', name: '', type: 'address' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      { internalType: 'address', name: 'auth_', type: 'address' },
      { internalType: 'bool', name: 'allowed_', type: 'bool' },
    ],
    name: 'setAuth',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      { internalType: 'address', name: 'deployer_', type: 'address' },
      { internalType: 'bool', name: 'allowed_', type: 'bool' },
    ],
    name: 'setDeployer',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      { internalType: 'string', name: 'fTokenType_', type: 'string' },
      { internalType: 'bytes', name: 'creationCode_', type: 'bytes' },
    ],
    name: 'setFTokenCreationCode',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [{ internalType: 'address', name: 'newOwner', type: 'address' }],
    name: 'transferOwnership',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
];
