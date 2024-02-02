const GMI_VAULT_ABI = [
  {
    type: 'constructor',
    inputs: [
      { name: 'auth', type: 'address', internalType: 'contract Auth' },
      {
        name: 'registry',
        type: 'address',
        internalType: 'contract WhitelistedTokenRegistry',
      },
    ],
    stateMutability: 'nonpayable',
  },
  { type: 'fallback', stateMutability: 'payable' },
  { type: 'receive', stateMutability: 'payable' },
  {
    type: 'function',
    name: 'AUTH',
    inputs: [],
    outputs: [{ name: '', type: 'address', internalType: 'contract Auth' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'DOMAIN_SEPARATOR',
    inputs: [],
    outputs: [{ name: '', type: 'bytes32', internalType: 'bytes32' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'INDEX_SIZE',
    inputs: [],
    outputs: [{ name: '', type: 'uint256', internalType: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'STORAGE_SLOT',
    inputs: [],
    outputs: [{ name: '', type: 'bytes32', internalType: 'bytes32' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'allowance',
    inputs: [
      { name: '', type: 'address', internalType: 'address' },
      { name: '', type: 'address', internalType: 'address' },
    ],
    outputs: [{ name: '', type: 'uint256', internalType: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'appraiseAssets',
    inputs: [
      {
        name: 'assetAmounts',
        type: 'uint256[]',
        internalType: 'uint256[]',
      },
      {
        name: 'prices',
        type: 'tuple[]',
        internalType: 'struct GmxStorage.MarketPrices[]',
        components: [
          {
            name: 'indexTokenPrice',
            type: 'tuple',
            internalType: 'struct GmxStorage.Price',
            components: [
              { name: 'min', type: 'uint256', internalType: 'uint256' },
              { name: 'max', type: 'uint256', internalType: 'uint256' },
            ],
          },
          {
            name: 'longTokenPrice',
            type: 'tuple',
            internalType: 'struct GmxStorage.Price',
            components: [
              { name: 'min', type: 'uint256', internalType: 'uint256' },
              { name: 'max', type: 'uint256', internalType: 'uint256' },
            ],
          },
          {
            name: 'shortTokenPrice',
            type: 'tuple',
            internalType: 'struct GmxStorage.Price',
            components: [
              { name: 'min', type: 'uint256', internalType: 'uint256' },
              { name: 'max', type: 'uint256', internalType: 'uint256' },
            ],
          },
        ],
      },
    ],
    outputs: [{ name: '', type: 'uint256[]', internalType: 'uint256[]' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'approve',
    inputs: [
      { name: 'spender', type: 'address', internalType: 'address' },
      { name: 'amount', type: 'uint256', internalType: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bool', internalType: 'bool' }],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'balanceOf',
    inputs: [{ name: '', type: 'address', internalType: 'address' }],
    outputs: [{ name: '', type: 'uint256', internalType: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'balances',
    inputs: [],
    outputs: [{ name: '', type: 'uint256[]', internalType: 'uint256[]' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'collectArb',
    inputs: [],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'currentCallbackHandler',
    inputs: [],
    outputs: [{ name: '', type: 'address', internalType: 'address' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'decimals',
    inputs: [],
    outputs: [{ name: '', type: 'uint8', internalType: 'uint8' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'defaultHandlers',
    inputs: [{ name: '', type: 'bytes4', internalType: 'bytes4' }],
    outputs: [
      {
        name: '',
        type: 'address',
        internalType: 'contract IHandlerContract',
      },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'deposit',
    inputs: [
      { name: 'assets', type: 'uint256[]', internalType: 'uint256[]' },
      {
        name: 'prices',
        type: 'tuple[]',
        internalType: 'struct GmxStorage.MarketPrices[]',
        components: [
          {
            name: 'indexTokenPrice',
            type: 'tuple',
            internalType: 'struct GmxStorage.Price',
            components: [
              { name: 'min', type: 'uint256', internalType: 'uint256' },
              { name: 'max', type: 'uint256', internalType: 'uint256' },
            ],
          },
          {
            name: 'longTokenPrice',
            type: 'tuple',
            internalType: 'struct GmxStorage.Price',
            components: [
              { name: 'min', type: 'uint256', internalType: 'uint256' },
              { name: 'max', type: 'uint256', internalType: 'uint256' },
            ],
          },
          {
            name: 'shortTokenPrice',
            type: 'tuple',
            internalType: 'struct GmxStorage.Price',
            components: [
              { name: 'min', type: 'uint256', internalType: 'uint256' },
              { name: 'max', type: 'uint256', internalType: 'uint256' },
            ],
          },
        ],
      },
      { name: 'receiver', type: 'address', internalType: 'address' },
    ],
    outputs: [{ name: 'shares', type: 'uint256', internalType: 'uint256' }],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'depositEth',
    inputs: [],
    outputs: [],
    stateMutability: 'payable',
  },
  {
    type: 'function',
    name: 'execute',
    inputs: [
      { name: '_handler', type: 'address', internalType: 'address' },
      { name: 'data', type: 'bytes', internalType: 'bytes' },
    ],
    outputs: [{ name: 'ret', type: 'bytes', internalType: 'bytes' }],
    stateMutability: 'payable',
  },
  {
    type: 'function',
    name: 'executeSwap',
    inputs: [
      {
        name: '_swapManager',
        type: 'address',
        internalType: 'contract ISwapManager',
      },
      { name: '_tokenIn', type: 'address', internalType: 'address' },
      { name: '_tokenOut', type: 'address', internalType: 'address' },
      { name: '_amountIn', type: 'uint256', internalType: 'uint256' },
      { name: '_minOut', type: 'uint256', internalType: 'uint256' },
      { name: '_data', type: 'bytes', internalType: 'bytes' },
    ],
    outputs: [{ name: '_amountOut', type: 'uint256', internalType: 'uint256' }],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'executeWithCallbackHandler',
    inputs: [
      { name: '_handler', type: 'address', internalType: 'address' },
      { name: 'data', type: 'bytes', internalType: 'bytes' },
      {
        name: '_callbackHandler',
        type: 'address',
        internalType: 'address',
      },
    ],
    outputs: [{ name: 'ret', type: 'bytes', internalType: 'bytes' }],
    stateMutability: 'payable',
  },
  {
    type: 'function',
    name: 'getUnderlyingMarketCompositions',
    inputs: [],
    outputs: [
      {
        name: 'underlyingBalances',
        type: 'uint256[2]',
        internalType: 'uint256[2]',
      },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'getWeights',
    inputs: [],
    outputs: [{ name: '', type: 'uint256[]', internalType: 'uint256[]' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'handlerContractCallbacks',
    inputs: [
      {
        name: '',
        type: 'address',
        internalType: 'contract IHandlerContract',
      },
      { name: '', type: 'bytes4', internalType: 'bytes4' },
    ],
    outputs: [{ name: '', type: 'bool', internalType: 'bool' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'handlerContracts',
    inputs: [
      {
        name: '',
        type: 'address',
        internalType: 'contract IHandlerContract',
      },
    ],
    outputs: [{ name: '', type: 'bool', internalType: 'bool' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'indexAssets',
    inputs: [],
    outputs: [
      {
        name: 'assetAddresses',
        type: 'address[]',
        internalType: 'address[]',
      },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'initStorage',
    inputs: [
      { name: 'gmHandler', type: 'address', internalType: 'address' },
      {
        name: '_indexAssets',
        type: 'address[]',
        internalType: 'address[]',
      },
      {
        name: '_weights',
        type: 'uint256[]',
        internalType: 'uint256[]',
      },
      {
        name: '_depositTolerance',
        type: 'uint256',
        internalType: 'uint256',
      },
      {
        name: '_mintCapTolerance',
        type: 'uint256',
        internalType: 'uint256',
      },
      { name: '_fallbackPool', type: 'uint8', internalType: 'uint8' },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'name',
    inputs: [],
    outputs: [{ name: '', type: 'string', internalType: 'string' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'nonces',
    inputs: [{ name: '', type: 'address', internalType: 'address' }],
    outputs: [{ name: '', type: 'uint256', internalType: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'permit',
    inputs: [
      { name: 'owner', type: 'address', internalType: 'address' },
      { name: 'spender', type: 'address', internalType: 'address' },
      { name: 'value', type: 'uint256', internalType: 'uint256' },
      { name: 'deadline', type: 'uint256', internalType: 'uint256' },
      { name: 'v', type: 'uint8', internalType: 'uint8' },
      { name: 'r', type: 'bytes32', internalType: 'bytes32' },
      { name: 's', type: 'bytes32', internalType: 'bytes32' },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'pps',
    inputs: [
      {
        name: 'prices',
        type: 'tuple[]',
        internalType: 'struct GmxStorage.MarketPrices[]',
        components: [
          {
            name: 'indexTokenPrice',
            type: 'tuple',
            internalType: 'struct GmxStorage.Price',
            components: [
              { name: 'min', type: 'uint256', internalType: 'uint256' },
              { name: 'max', type: 'uint256', internalType: 'uint256' },
            ],
          },
          {
            name: 'longTokenPrice',
            type: 'tuple',
            internalType: 'struct GmxStorage.Price',
            components: [
              { name: 'min', type: 'uint256', internalType: 'uint256' },
              { name: 'max', type: 'uint256', internalType: 'uint256' },
            ],
          },
          {
            name: 'shortTokenPrice',
            type: 'tuple',
            internalType: 'struct GmxStorage.Price',
            components: [
              { name: 'min', type: 'uint256', internalType: 'uint256' },
              { name: 'max', type: 'uint256', internalType: 'uint256' },
            ],
          },
        ],
      },
    ],
    outputs: [
      {
        name: 'pricePerShare',
        type: 'uint256',
        internalType: 'uint256',
      },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'previewMint',
    inputs: [
      { name: 'shares', type: 'uint256', internalType: 'uint256' },
      {
        name: 'prices',
        type: 'tuple[]',
        internalType: 'struct GmxStorage.MarketPrices[]',
        components: [
          {
            name: 'indexTokenPrice',
            type: 'tuple',
            internalType: 'struct GmxStorage.Price',
            components: [
              { name: 'min', type: 'uint256', internalType: 'uint256' },
              { name: 'max', type: 'uint256', internalType: 'uint256' },
            ],
          },
          {
            name: 'longTokenPrice',
            type: 'tuple',
            internalType: 'struct GmxStorage.Price',
            components: [
              { name: 'min', type: 'uint256', internalType: 'uint256' },
              { name: 'max', type: 'uint256', internalType: 'uint256' },
            ],
          },
          {
            name: 'shortTokenPrice',
            type: 'tuple',
            internalType: 'struct GmxStorage.Price',
            components: [
              { name: 'min', type: 'uint256', internalType: 'uint256' },
              { name: 'max', type: 'uint256', internalType: 'uint256' },
            ],
          },
        ],
      },
    ],
    outputs: [{ name: '', type: 'uint256[]', internalType: 'uint256[]' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'previewRedeem',
    inputs: [
      { name: 'shares', type: 'uint256', internalType: 'uint256' },
      {
        name: 'prices',
        type: 'tuple[]',
        internalType: 'struct GmxStorage.MarketPrices[]',
        components: [
          {
            name: 'indexTokenPrice',
            type: 'tuple',
            internalType: 'struct GmxStorage.Price',
            components: [
              { name: 'min', type: 'uint256', internalType: 'uint256' },
              { name: 'max', type: 'uint256', internalType: 'uint256' },
            ],
          },
          {
            name: 'longTokenPrice',
            type: 'tuple',
            internalType: 'struct GmxStorage.Price',
            components: [
              { name: 'min', type: 'uint256', internalType: 'uint256' },
              { name: 'max', type: 'uint256', internalType: 'uint256' },
            ],
          },
          {
            name: 'shortTokenPrice',
            type: 'tuple',
            internalType: 'struct GmxStorage.Price',
            components: [
              { name: 'min', type: 'uint256', internalType: 'uint256' },
              { name: 'max', type: 'uint256', internalType: 'uint256' },
            ],
          },
        ],
      },
    ],
    outputs: [{ name: '', type: 'uint256[]', internalType: 'uint256[]' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'redeem',
    inputs: [
      { name: 'shares', type: 'uint256', internalType: 'uint256' },
      { name: 'receiver', type: 'address', internalType: 'address' },
      { name: 'owner', type: 'address', internalType: 'address' },
      {
        name: 'prices',
        type: 'tuple[]',
        internalType: 'struct GmxStorage.MarketPrices[]',
        components: [
          {
            name: 'indexTokenPrice',
            type: 'tuple',
            internalType: 'struct GmxStorage.Price',
            components: [
              { name: 'min', type: 'uint256', internalType: 'uint256' },
              { name: 'max', type: 'uint256', internalType: 'uint256' },
            ],
          },
          {
            name: 'longTokenPrice',
            type: 'tuple',
            internalType: 'struct GmxStorage.Price',
            components: [
              { name: 'min', type: 'uint256', internalType: 'uint256' },
              { name: 'max', type: 'uint256', internalType: 'uint256' },
            ],
          },
          {
            name: 'shortTokenPrice',
            type: 'tuple',
            internalType: 'struct GmxStorage.Price',
            components: [
              { name: 'min', type: 'uint256', internalType: 'uint256' },
              { name: 'max', type: 'uint256', internalType: 'uint256' },
            ],
          },
        ],
      },
    ],
    outputs: [{ name: 'assets', type: 'uint256[]', internalType: 'uint256[]' }],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'retrieveEth',
    inputs: [{ name: 'amount', type: 'uint256', internalType: 'uint256' }],
    outputs: [],
    stateMutability: 'payable',
  },
  {
    type: 'function',
    name: 'setDepositTolerance',
    inputs: [
      {
        name: 'newTolderance',
        type: 'uint256',
        internalType: 'uint256',
      },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'setFallbackMintPool',
    inputs: [{ name: 'poolIndex', type: 'uint8', internalType: 'uint8' }],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'setGmiV2Handler',
    inputs: [{ name: 'gmiHandler', type: 'address', internalType: 'address' }],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'setMintCapTolerance',
    inputs: [
      {
        name: 'newTolderance',
        type: 'uint256',
        internalType: 'uint256',
      },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'setTargetWeights',
    inputs: [
      {
        name: 'newWeights',
        type: 'uint256[]',
        internalType: 'uint256[]',
      },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'sharesToMarketTokens',
    inputs: [
      { name: 'shares', type: 'uint256', internalType: 'uint256' },
      {
        name: 'prices',
        type: 'tuple[]',
        internalType: 'struct GmxStorage.MarketPrices[]',
        components: [
          {
            name: 'indexTokenPrice',
            type: 'tuple',
            internalType: 'struct GmxStorage.Price',
            components: [
              { name: 'min', type: 'uint256', internalType: 'uint256' },
              { name: 'max', type: 'uint256', internalType: 'uint256' },
            ],
          },
          {
            name: 'longTokenPrice',
            type: 'tuple',
            internalType: 'struct GmxStorage.Price',
            components: [
              { name: 'min', type: 'uint256', internalType: 'uint256' },
              { name: 'max', type: 'uint256', internalType: 'uint256' },
            ],
          },
          {
            name: 'shortTokenPrice',
            type: 'tuple',
            internalType: 'struct GmxStorage.Price',
            components: [
              { name: 'min', type: 'uint256', internalType: 'uint256' },
              { name: 'max', type: 'uint256', internalType: 'uint256' },
            ],
          },
        ],
      },
    ],
    outputs: [{ name: '', type: 'uint256[]', internalType: 'uint256[]' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'swapHandlers',
    inputs: [
      {
        name: '',
        type: 'address',
        internalType: 'contract ISwapManager',
      },
    ],
    outputs: [{ name: '', type: 'bool', internalType: 'bool' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'symbol',
    inputs: [],
    outputs: [{ name: '', type: 'string', internalType: 'string' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'totalSupply',
    inputs: [],
    outputs: [{ name: '', type: 'uint256', internalType: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'transfer',
    inputs: [
      { name: 'to', type: 'address', internalType: 'address' },
      { name: 'amount', type: 'uint256', internalType: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bool', internalType: 'bool' }],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'transferFrom',
    inputs: [
      { name: 'from', type: 'address', internalType: 'address' },
      { name: 'to', type: 'address', internalType: 'address' },
      { name: 'amount', type: 'uint256', internalType: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bool', internalType: 'bool' }],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'tvl',
    inputs: [
      {
        name: 'prices',
        type: 'tuple[]',
        internalType: 'struct GmxStorage.MarketPrices[]',
        components: [
          {
            name: 'indexTokenPrice',
            type: 'tuple',
            internalType: 'struct GmxStorage.Price',
            components: [
              { name: 'min', type: 'uint256', internalType: 'uint256' },
              { name: 'max', type: 'uint256', internalType: 'uint256' },
            ],
          },
          {
            name: 'longTokenPrice',
            type: 'tuple',
            internalType: 'struct GmxStorage.Price',
            components: [
              { name: 'min', type: 'uint256', internalType: 'uint256' },
              { name: 'max', type: 'uint256', internalType: 'uint256' },
            ],
          },
          {
            name: 'shortTokenPrice',
            type: 'tuple',
            internalType: 'struct GmxStorage.Price',
            components: [
              { name: 'min', type: 'uint256', internalType: 'uint256' },
              { name: 'max', type: 'uint256', internalType: 'uint256' },
            ],
          },
        ],
      },
    ],
    outputs: [
      {
        name: 'totalValueLocked',
        type: 'uint256',
        internalType: 'uint256',
      },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'updateDefaultHandlerContract',
    inputs: [
      { name: '_sig', type: 'bytes4', internalType: 'bytes4' },
      {
        name: '_handler',
        type: 'address',
        internalType: 'contract IHandlerContract',
      },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'updateHandlerContract',
    inputs: [
      {
        name: '_handler',
        type: 'address',
        internalType: 'contract IHandlerContract',
      },
      { name: '_enabled', type: 'bool', internalType: 'bool' },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'updateSwapHandler',
    inputs: [
      {
        name: '_manager',
        type: 'address',
        internalType: 'contract ISwapManager',
      },
      { name: '_enabled', type: 'bool', internalType: 'bool' },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'event',
    name: 'Approval',
    inputs: [
      {
        name: 'owner',
        type: 'address',
        indexed: true,
        internalType: 'address',
      },
      {
        name: 'spender',
        type: 'address',
        indexed: true,
        internalType: 'address',
      },
      {
        name: 'amount',
        type: 'uint256',
        indexed: false,
        internalType: 'uint256',
      },
    ],
    anonymous: false,
  },
  {
    type: 'event',
    name: 'CallbackHandlerUpdated',
    inputs: [
      {
        name: '_sig',
        type: 'bytes4',
        indexed: true,
        internalType: 'bytes4',
      },
      {
        name: '_handler',
        type: 'address',
        indexed: true,
        internalType: 'address',
      },
      {
        name: '_enabled',
        type: 'bool',
        indexed: false,
        internalType: 'bool',
      },
    ],
    anonymous: false,
  },
  {
    type: 'event',
    name: 'DefaultHandlerContractUpdated',
    inputs: [
      {
        name: '_sig',
        type: 'bytes4',
        indexed: true,
        internalType: 'bytes4',
      },
      {
        name: '_handler',
        type: 'address',
        indexed: true,
        internalType: 'address',
      },
    ],
    anonymous: false,
  },
  {
    type: 'event',
    name: 'Deposit',
    inputs: [
      {
        name: 'caller',
        type: 'address',
        indexed: true,
        internalType: 'address',
      },
      {
        name: 'owner',
        type: 'address',
        indexed: true,
        internalType: 'address',
      },
      {
        name: 'value',
        type: 'uint256',
        indexed: false,
        internalType: 'uint256',
      },
      {
        name: 'shares',
        type: 'uint256',
        indexed: false,
        internalType: 'uint256',
      },
    ],
    anonymous: false,
  },
  {
    type: 'event',
    name: 'HandlerContractUpdated',
    inputs: [
      {
        name: '_contract',
        type: 'address',
        indexed: true,
        internalType: 'address',
      },
      {
        name: '_enabled',
        type: 'bool',
        indexed: false,
        internalType: 'bool',
      },
    ],
    anonymous: false,
  },
  {
    type: 'event',
    name: 'SwapHandlerUpdated',
    inputs: [
      {
        name: '_handled',
        type: 'address',
        indexed: true,
        internalType: 'address',
      },
      {
        name: '_enabled',
        type: 'bool',
        indexed: false,
        internalType: 'bool',
      },
    ],
    anonymous: false,
  },
  {
    type: 'event',
    name: 'Transfer',
    inputs: [
      {
        name: 'from',
        type: 'address',
        indexed: true,
        internalType: 'address',
      },
      {
        name: 'to',
        type: 'address',
        indexed: true,
        internalType: 'address',
      },
      {
        name: 'amount',
        type: 'uint256',
        indexed: false,
        internalType: 'uint256',
      },
    ],
    anonymous: false,
  },
  {
    type: 'event',
    name: 'WhitelistedTokenUpdated',
    inputs: [
      {
        name: '_token',
        type: 'address',
        indexed: true,
        internalType: 'address',
      },
      {
        name: '_isWhitelisted',
        type: 'bool',
        indexed: false,
        internalType: 'bool',
      },
    ],
    anonymous: false,
  },
  {
    type: 'event',
    name: 'Withdraw',
    inputs: [
      {
        name: 'caller',
        type: 'address',
        indexed: true,
        internalType: 'address',
      },
      {
        name: 'receiver',
        type: 'address',
        indexed: true,
        internalType: 'address',
      },
      {
        name: 'owner',
        type: 'address',
        indexed: true,
        internalType: 'address',
      },
      {
        name: 'value',
        type: 'uint256',
        indexed: false,
        internalType: 'uint256',
      },
      {
        name: 'shares',
        type: 'uint256',
        indexed: false,
        internalType: 'uint256',
      },
    ],
    anonymous: false,
  },
  { type: 'error', name: 'CallbackHandlerNotSet', inputs: [] },
  {
    type: 'error',
    name: 'EmptyContract',
    inputs: [{ name: '', type: 'address', internalType: 'address' }],
  },
  { type: 'error', name: 'NotWhitelistedToken', inputs: [] },
  { type: 'error', name: 'OnlySelf', inputs: [] },
  { type: 'error', name: 'UnknownCallback', inputs: [] },
  { type: 'error', name: 'UnknownHandlerContract', inputs: [] },
];

module.exports = { GMI_VAULT_ABI };
