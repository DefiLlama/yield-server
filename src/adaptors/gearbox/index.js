/**
 **
 **
 **
 ** This file has been generated from source code in https://github.com/Gearbox-protocol/defillama repo
 ** Binary release: https://github.com/Gearbox-protocol/defillama/releases/tag/v1.2.2
 **
 **
 **
 **/

var sdk = require('@defillama/sdk');
var utils = require('../utils');
const fetch = require('node-fetch');

// src/yield-server/index.ts

// src/yield-server/abis.ts
var abis_default = {
  getPoolsV3List: {
    inputs: [],
    name: 'getPoolsV3List',
    outputs: [
      {
        components: [
          {
            internalType: 'address',
            name: 'addr',
            type: 'address',
          },
          {
            internalType: 'address',
            name: 'underlying',
            type: 'address',
          },
          {
            internalType: 'address',
            name: 'dieselToken',
            type: 'address',
          },
          {
            internalType: 'string',
            name: 'symbol',
            type: 'string',
          },
          {
            internalType: 'string',
            name: 'name',
            type: 'string',
          },
          {
            internalType: 'uint256',
            name: 'baseInterestIndex',
            type: 'uint256',
          },
          {
            internalType: 'uint256',
            name: 'availableLiquidity',
            type: 'uint256',
          },
          {
            internalType: 'uint256',
            name: 'expectedLiquidity',
            type: 'uint256',
          },
          {
            internalType: 'uint256',
            name: 'totalBorrowed',
            type: 'uint256',
          },
          {
            internalType: 'uint256',
            name: 'totalDebtLimit',
            type: 'uint256',
          },
          {
            components: [
              {
                internalType: 'address',
                name: 'creditManager',
                type: 'address',
              },
              {
                internalType: 'uint256',
                name: 'borrowed',
                type: 'uint256',
              },
              {
                internalType: 'uint256',
                name: 'limit',
                type: 'uint256',
              },
              {
                internalType: 'uint256',
                name: 'availableToBorrow',
                type: 'uint256',
              },
            ],
            internalType: 'struct CreditManagerDebtParams[]',
            name: 'creditManagerDebtParams',
            type: 'tuple[]',
          },
          {
            internalType: 'uint256',
            name: 'totalAssets',
            type: 'uint256',
          },
          {
            internalType: 'uint256',
            name: 'totalSupply',
            type: 'uint256',
          },
          {
            internalType: 'uint256',
            name: 'supplyRate',
            type: 'uint256',
          },
          {
            internalType: 'uint256',
            name: 'baseInterestRate',
            type: 'uint256',
          },
          {
            internalType: 'uint256',
            name: 'dieselRate_RAY',
            type: 'uint256',
          },
          {
            internalType: 'uint256',
            name: 'withdrawFee',
            type: 'uint256',
          },
          {
            internalType: 'uint256',
            name: 'lastBaseInterestUpdate',
            type: 'uint256',
          },
          {
            internalType: 'uint256',
            name: 'baseInterestIndexLU',
            type: 'uint256',
          },
          {
            internalType: 'uint256',
            name: 'version',
            type: 'uint256',
          },
          {
            internalType: 'address',
            name: 'poolQuotaKeeper',
            type: 'address',
          },
          {
            internalType: 'address',
            name: 'gauge',
            type: 'address',
          },
          {
            components: [
              {
                internalType: 'address',
                name: 'token',
                type: 'address',
              },
              {
                internalType: 'uint16',
                name: 'rate',
                type: 'uint16',
              },
              {
                internalType: 'uint16',
                name: 'quotaIncreaseFee',
                type: 'uint16',
              },
              {
                internalType: 'uint96',
                name: 'totalQuoted',
                type: 'uint96',
              },
              {
                internalType: 'uint96',
                name: 'limit',
                type: 'uint96',
              },
              {
                internalType: 'bool',
                name: 'isActive',
                type: 'bool',
              },
            ],
            internalType: 'struct QuotaInfo[]',
            name: 'quotas',
            type: 'tuple[]',
          },
          {
            components: [
              {
                internalType: 'address',
                name: 'zapper',
                type: 'address',
              },
              {
                internalType: 'address',
                name: 'tokenIn',
                type: 'address',
              },
              {
                internalType: 'address',
                name: 'tokenOut',
                type: 'address',
              },
            ],
            internalType: 'struct ZapperInfo[]',
            name: 'zappers',
            type: 'tuple[]',
          },
          {
            components: [
              {
                internalType: 'address',
                name: 'interestModel',
                type: 'address',
              },
              {
                internalType: 'uint256',
                name: 'version',
                type: 'uint256',
              },
              {
                internalType: 'uint16',
                name: 'U_1',
                type: 'uint16',
              },
              {
                internalType: 'uint16',
                name: 'U_2',
                type: 'uint16',
              },
              {
                internalType: 'uint16',
                name: 'R_base',
                type: 'uint16',
              },
              {
                internalType: 'uint16',
                name: 'R_slope1',
                type: 'uint16',
              },
              {
                internalType: 'uint16',
                name: 'R_slope2',
                type: 'uint16',
              },
              {
                internalType: 'uint16',
                name: 'R_slope3',
                type: 'uint16',
              },
              {
                internalType: 'bool',
                name: 'isBorrowingMoreU2Forbidden',
                type: 'bool',
              },
            ],
            internalType: 'struct LinearModel',
            name: 'lirm',
            type: 'tuple',
          },
          {
            internalType: 'bool',
            name: 'isPaused',
            type: 'bool',
          },
        ],
        internalType: 'struct PoolData[]',
        name: 'result',
        type: 'tuple[]',
      },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  farmInfo: {
    inputs: [],
    name: 'farmInfo',
    outputs: [
      {
        components: [
          {
            internalType: 'uint40',
            name: 'finished',
            type: 'uint40',
          },
          {
            internalType: 'uint32',
            name: 'duration',
            type: 'uint32',
          },
          {
            internalType: 'uint184',
            name: 'reward',
            type: 'uint184',
          },
          {
            internalType: 'uint256',
            name: 'balance',
            type: 'uint256',
          },
        ],
        internalType: 'struct FarmAccounting.Info',
        name: '',
        type: 'tuple',
      },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  symbol: 'function symbol() external view returns (string)',
  totalSupply: 'function totalSupply() external view returns (uint256)',
  stakingToken: 'function stakingToken() external view returns (address)',
  decimals: 'function decimals() external view returns (uint8)',
  fees: 'function fees() external view returns (uint16 feeInterest, uint16 feeLiquidation, uint16 liquidationDiscount, uint16 feeLiquidationExpired, uint16 liquidationDiscountExpired)',
  getCreditManagers:
    'function getCreditManagers() external view returns (address[])',
  pool: 'function pool() external view returns (address)',
  getAddressOrRevert:
    'function getAddressOrRevert(bytes32 key, uint256 version) view returns (address result)',
};

// src/yield-server/constants.ts
// Chain-specific configurations
var CHAIN_CONFIGS = {
  ethereum: {
    ADDRESS_PROVIDER_V3: '0x9ea7b04da02a5373317d745c1571c84aad03321d',
    GEAR_TOKEN: '0xBa3335588D9403515223F109EdC4eB7269a9Ab5D'.toLowerCase(),
    chainName: 'Ethereum',
    // Ethereum-specific exclusions and rewards
    EXCLUDED_POOLS: {
      '0x1dc0f3359a254f876b37906cfc1000a35ce2d717': 'USDT V3 Broken',
    },
    // Ethereum KPK (PoolQuotaKeeper) pools that need manual configuration
    POOLS: {
      '0xa9d17f6d3285208280a1fd9b94479c62e0aaba64': {
        symbol: 'wstETH',
        underlying: '0x7f39C581F595B53c5cb19bD0b3f8dA6c935E2Ca0', // wstETH
        name: 'kpk wstETH',
      },
      '0x9396dcbf78fc526bb003665337c5e73b699571ef': {
        symbol: 'ETH',
        underlying: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', // WETH
        name: 'kpk ETH',
      },
    },
  },
  plasma: {
    ADDRESS_PROVIDER_V3: null, // Plasma uses individual pool approach
    GEAR_TOKEN: null, // No GEAR rewards on Plasma initially
    WXPL_TOKEN: '0x6100E367285b01F48D07953803A2d8dCA5D19873'.toLowerCase(), // WXPL reward token
    chainName: 'Plasma',
    // Plasma-specific pool configurations
    POOLS: {
      '0x76309A9a56309104518847BbA321c261B7B4a43f': {
        symbol: 'dUSDT0',
        underlying: '0xb8ce59fc3717ada4c02eadf9682a9e934f625ebb', // USDT0 deposit token
        name: 'Invariant USDT0',
      },
      '0x53e4e9b8766969c43895839cc9c673bb6bc8ac97': {
        symbol: 'USDT0 v3',
        underlying: '0xB8CE59FC3717ada4C02eaDF9682A9e934F625ebb', // USDT0
        name: 'Edge UltraYield',
      },
      '0xb74760fd26400030620027dd29d19d74d514700e': {
        symbol: 'hyperGearboxUSDT',
        underlying: '0xB8CE59FC3717ada4C02eaDF9682A9e934F625ebb', // USDT0
        name: 'Hyperithm Gearbox USDT',
      },
    },
  },
  etlk: {
    ADDRESS_PROVIDER_V3: null,
    GEAR_TOKEN: null,
    REWARD_TOKEN: '0x0008b6C5b44305693bEB4Cd6E1A91b239D2A041E'.toLowerCase(),
    chainName: 'Etherlink',
    POOLS: {
      '0x653e62A9Ef0e869F91Dc3D627B479592aA02eA75': {
        symbol: 'USDC',
        underlying: '0x796Ea11Fa2dD751eD01b53C372fFDB4AAa8f00F9', // USDC
        name: 'USDC Lending Pool',
      },
    },
  },
  lisk: {
    ADDRESS_PROVIDER_V3: null,
    GEAR_TOKEN: null,
    REWARD_TOKEN: '0xac485391EB2d7D88253a7F1eF18C37f4242D1A24'.toLowerCase(), // LISK
    chainName: 'Lisk',
    POOLS: {
      '0xA16952191248E6B4b3A24130Dfc47F96ab1956a7': {
        symbol: 'ETH',
        underlying: '0x4200000000000000000000000000000000000006', // WETH
        name: 'WETH Lending Pool',
      },
    },
  },
  hemi: {
    ADDRESS_PROVIDER_V3: null,
    GEAR_TOKEN: null,
    REWARD_TOKEN: '0xad11a8BEb98bbf61dbb1aa0F6d6F2ECD87b35afA'.toLowerCase(), // USDC.E
    chainName: 'Hemi',
    POOLS: {
      '0x614eB485DE3c6C49701b40806AC1B985ad6F0A2f': {
        symbol: 'USDC.E',
        underlying: '0xad11a8BEb98bbf61dbb1aa0F6d6F2ECD87b35afA', // USDC.E
        name: 'USDC.E Lending Pool',
      },
    },
  },
  monad: {
    ADDRESS_PROVIDER_V3: null,
    GEAR_TOKEN: null,
    REWARD_TOKEN: '0x34752948b0dc28969485df2066ffe86d5dc36689'.toLowerCase(), // MON
    chainName: 'Monad',
    POOLS: {
      '0x6b343f7b797f1488aa48c49d540690f2b2c89751': {
        symbol: 'dUSDC',
        underlying: '0x754704Bc059F8C67012fEd69BC8A327a5aafb603', // USDC
        name: 'USDC Pool',
      },
      '0x34752948b0dc28969485df2066ffe86d5dc36689': {
        symbol: 'dMON',
        underlying: '0x3bd359C1119dA7Da1D913D1C4D2B7c461115433A', // MON
        name: 'MON Pool',
      },
      '0x164a35f31e4e0f6c45d500962a6978d2cbd5a16b': {
        symbol: 'dUSDT0',
        underlying: '0xe7cd86e13AC4309349F30B3435a9d337750fC82D', // USDT0
        name: 'USDT0 Pool',
      },
      '0xc4173359087ce643235420b7bc610d9b0cf2b82d': {
        symbol: 'edgeAUSD',
        underlying: '0x00000000eFE302BEAA2b3e6e1b18d08D69a9012a', // AUSD
        name: 'AUSD Pool',
      },
    },
  },
};

// Legacy constants for backward compatibility
var ADDRESS_PROVIDER_V3 = CHAIN_CONFIGS.ethereum.ADDRESS_PROVIDER_V3;
var GEAR_TOKEN = CHAIN_CONFIGS.ethereum.GEAR_TOKEN;
var GHO_TOKEN = '0x40D16FC0246aD3160Ccc09B8D0D3A2cD28aE6C2f'.toLowerCase();
var POOL_USDT_V3_BROKEN = '0x1dc0f3359a254f876b37906cfc1000a35ce2d717'.toLowerCase();
var POOL_GHO_V3 = '0x4d56c9cBa373AD39dF69Eb18F076b7348000AE09'.toLowerCase();

// src/yield-server/extraRewards.ts
// Chain-specific extra rewards configuration
var EXTRA_REWARDS = {
  ethereum: {
    [POOL_GHO_V3]: [
      {
        token: GHO_TOKEN,
        getFarmInfo: (timestamp) => {
          const GHO_DECIMALS = Math.pow(10, 18);
          const REWARD_PERIOD = 14 * 24 * 60 * 60;
          const REWARDS_FIRST_START = 1711448651;
          const REWARDS_FIRST_END = REWARDS_FIRST_START + REWARD_PERIOD;
          const REWARDS_SECOND_END = REWARDS_FIRST_END + REWARD_PERIOD;
          const REWARD_FIRST_PART = 15000 * GHO_DECIMALS;
          const REWARD_SECOND_PART = 10000 * GHO_DECIMALS;
          const reward =
            timestamp >= REWARDS_FIRST_END
              ? REWARD_SECOND_PART
              : REWARD_FIRST_PART;
          return {
            balance: 0,
            duration: REWARD_PERIOD,
            finished:
              timestamp >= REWARDS_FIRST_END
                ? REWARDS_SECOND_END
                : REWARDS_FIRST_END,
            reward,
          };
        },
      },
    ],
  },
  plasma: {
    // No extra rewards on Plasma initially
  },
};

// Helper function to get chain-specific extra rewards
function getExtraRewards(chain, poolAddr) {
  return EXTRA_REWARDS[chain]?.[poolAddr] ?? [];
}

// Helper function to generate pool URLs
function getPoolUrl(chain, poolAddress) {
  const chainIds = {
    ethereum: '',
    plasma: '9745',
    etlk: '42793',
    lisk: '1135',
    hemi: '43111',
    monad: '143',
  };

  const chainId = chainIds[chain];
  return chainId ?
    `https://app.gearbox.fi/pools/${chainId}/${poolAddress}` :
    `https://app.gearbox.fi/pools/${poolAddress}`;
}

// Chain-specific Merkl API configurations
const MERKL_CONFIGS = {
  ethereum: {
    chainId: 1,
    rewardToken: '0xBa3335588D9403515223F109EdC4eB7269a9Ab5D', // GEAR
    pools: [
      '0xda0002859B2d05F66a753d8241fCDE8623f26F4f', // WETH
      '0xe7146F53dBcae9D6Fa3555FE502648deb0B2F823', // DAI
      '0xda00000035fef4082F78dEF6A8903bee419FbF8E', // USDC
      '0x05A811275fE9b4DE503B3311F51edF6A856D936e', // USDT
      '0x4d56c9cBa373AD39dF69Eb18F076b7348000AE09', // GHO
      '0x72CCB97cbdC40f8fb7FFA42Ed93AE74923547200', // wstETH (with Merkl rewards)
      '0xa9d17f6d3285208280a1fd9b94479c62e0aaba64', // KPK wstETH
      '0x9396dcbf78fc526bb003665337c5e73b699571ef', // KPK ETH
    ],
  },
  plasma: {
    chainId: 9745,
    rewardToken: '0x6100e367285b01f48d07953803a2d8dca5d19873', // WXPL
    pools: [
      '0x76309A9a56309104518847BbA321c261B7B4a43f', // Invariant USDT0 (existing)
      '0xB74760FD26400030620027DD29D19d74D514700e', // Hyperithm Gearbox
      '0x53E4e9b8766969c43895839CC9c673bb6bC8Ac97', // Edge UltraYield
    ],
  },
  etlk: {
    chainId: 42793,
    poolId: '0x653e62A9Ef0e869F91Dc3D627B479592aA02eA75',
    rewardToken: '0x0008b6C5b44305693bEB4Cd6E1A91b239D2A041E',
  },
  lisk: {
    chainId: 1135,
    poolId: '0xA16952191248E6B4b3A24130Dfc47F96ab1956a7',
    rewardToken: '0xac485391EB2d7D88253a7F1eF18C37f4242D1A24', // LISK
  },
  hemi: {
    chainId: 43111,
    poolId: '0x614eB485DE3c6C49701b40806AC1B985ad6F0A2f',
    rewardToken: '0xad11a8BEb98bbf61dbb1aa0F6d6F2ECD87b35afA', // USDC.E
  },
  monad: {
    chainId: 143,
    rewardToken: '0x34752948b0dc28969485df2066ffe86d5dc36689', // MON
    pools: [
      '0x6b343f7b797f1488aa48c49d540690f2b2c89751', // USDC Pool
      '0x34752948b0dc28969485df2066ffe86d5dc36689', // MON Pool
      '0x164a35f31e4e0f6c45d500962a6978d2cbd5a16b', // USDT0 Pool
      '0xc4173359087ce643235420b7bc610d9b0cf2b82d', // AUSD Pool
    ],
  },
};

// Fetch Merkl rewards data for supported chains
async function getMerklRewards(chain) {
  const config = MERKL_CONFIGS[chain];
  if (!config) return {};

  try {
    const rewards = {};

    // Handle multiple pools (new format) or single pool (backward compatibility)
    const poolsToFetch = config.pools || [config.poolId];

    // Fetch rewards for each pool
    await Promise.all(poolsToFetch.map(async (poolId) => {
      if (!poolId) return;

      try {
        const response = await fetch(`https://api.merkl.xyz/v4/opportunities/?chainId=${config.chainId}&identifier=${poolId}`);
        const data = await response.json();

        if (!data || !Array.isArray(data) || data.length === 0) {
          console.log(`⚠️  No Merkl rewards data found for ${chain} pool ${poolId}`);
          return;
        }

        const opportunity = data[0];
        if (opportunity.status !== 'LIVE') {
          console.log(`⚠️  Merkl rewards not currently LIVE for ${chain} pool ${poolId}`);
          return;
        }

        // Extract reward data for this pool
        rewards[opportunity.identifier.toLowerCase()] = {
          apr: opportunity.apr || 0,
          rewardToken: config.rewardToken,
          tvl: opportunity.tvl || 0,
          dailyRewards: opportunity.dailyRewards || 0,
        };
      } catch (poolError) {
        console.error(`Error fetching Merkl rewards for ${chain} pool ${poolId}:`, poolError.message);
      }
    }));

    return rewards;
  } catch (error) {
    console.error(`Error fetching Merkl rewards for ${chain}:`, error.message);
    return {};
  }
}

// src/yield-server/index.ts
var SECONDS_PER_YEAR = 365 * 24 * 60 * 60;
var WAD = Math.pow(10, 18);
var RAY = Math.pow(10, 27);
var PERCENTAGE_FACTOR = 10000;
async function call(...args) {
  return sdk.api2.abi.call(...args);
}
async function multiCall(...args) {
  return sdk.api2.abi.multiCall(...args);
}
async function fetchLLamaPrices(chain, addresses) {
  const coins = addresses.map((address) => `${chain}:${address}`).join(',');
  const resp = await fetch(`https://coins.llama.fi/prices/current/${coins}`);
  const data = await resp.json();
  const prices = {};
  for (const [coin, info] of Object.entries(data.coins)) {
    const address = coin.split(':')[1];
    prices[address.toLowerCase()] = Number(WAD) * info.price;
  }
  return prices;
}
async function getPoolsDaoFees(chain) {
  const chainConfig = CHAIN_CONFIGS[chain];

  // For chains without ADDRESS_PROVIDER_V3 (like Plasma), return empty fees
  if (!chainConfig?.ADDRESS_PROVIDER_V3) {
    console.log(`⚠️  No ADDRESS_PROVIDER_V3 for ${chain}, using default fees`);
    return {};
  }

  try {
    const contractsRegisterAddr = await call({
      abi: abis_default.getAddressOrRevert,
      target: chainConfig.ADDRESS_PROVIDER_V3,
      params: [
        // cast format-bytes32-string "CONTRACTS_REGISTER"
        '0x434f4e5452414354535f52454749535445520000000000000000000000000000',
        0,
      ],
      chain,
    });
    const cms = await call({
      target: contractsRegisterAddr,
      abi: abis_default.getCreditManagers,
      chain,
    });
    const pools = await multiCall({
      abi: abis_default.pool,
      calls: cms.map((target) => ({ target })),
      chain,
      permitFailure: true,
    });
    const daoFees = await multiCall({
      abi: abis_default.fees,
      calls: cms.map((target) => ({ target })),
      chain,
      permitFailure: true,
    });
    const result = {};
    for (let i = 0; i < daoFees.length; i++) {
      const daoFee = daoFees[i];
      const pool = pools[i]?.toLowerCase();
      if (daoFee && pool) {
        result[pool] = Number(daoFee.feeInterest);
      }
    }
    return result;
  } catch (error) {
    console.error(`Error fetching DAO fees for ${chain}:`, error.message);
    return {};
  }
}
// Plasma-specific pool fetching (individual pools, not registry-based)
async function getPlasmaPoolsV3(chain) {
  const chainConfig = CHAIN_CONFIGS[chain];
  if (!chainConfig?.POOLS) {
    return [];
  }

  const poolAddresses = Object.keys(chainConfig.POOLS);
  console.log(`🔍 Fetching ${poolAddresses.length} ${chain} pools...`);

  try {
    // Get basic pool data including borrowing information
    const [symbols, decimalsData, totalSupplies, supplyRates, totalBorrowedAmounts, availableLiquidities, baseInterestRates] = await Promise.all([
      multiCall({
        abi: abis_default.symbol,
        calls: poolAddresses.map((target) => ({ target })),
        chain,
      }),
      multiCall({
        abi: abis_default.decimals,
        calls: poolAddresses.map((target) => ({ target })),
        chain,
      }),
      multiCall({
        abi: 'erc20:totalSupply',
        calls: poolAddresses.map((target) => ({ target })),
        chain,
      }),
      multiCall({
        abi: 'function supplyRate() external view returns (uint256)',
        calls: poolAddresses.map((target) => ({ target })),
        chain,
      }),
      multiCall({
        abi: 'function totalBorrowed() external view returns (uint256)',
        calls: poolAddresses.map((target) => ({ target })),
        chain,
      }),
      multiCall({
        abi: 'function availableLiquidity() external view returns (uint256)',
        calls: poolAddresses.map((target) => ({ target })),
        chain,
      }),
      multiCall({
        abi: 'function baseInterestRate() external view returns (uint256)',
        calls: poolAddresses.map((target) => ({ target })),
        chain,
      }),
    ]);

    // Try to get underlying token (may fail, we'll handle gracefully)
    let underlyingTokens = [];
    try {
      underlyingTokens = await multiCall({
        abi: 'function underlying() external view returns (address)',
        calls: poolAddresses.map((target) => ({ target })),
        chain,
        permitFailure: true,
      });
    } catch (error) {
      console.log('⚠️  underlying() function not available, using pool as underlying');
      underlyingTokens = poolAddresses.map(() => null);
    }

    const pools = poolAddresses.map((poolAddr, i) => {
      const config = chainConfig.POOLS[poolAddr];
      return {
        pool: poolAddr,
        addr: poolAddr,
        name: config.name,
        symbol: symbols[i] || config.symbol,
        underlying: underlyingTokens[i] || config.underlying || poolAddr, // Use config.underlying if available
        // For Plasma USDT0 pool, use the actual USDT0 deposit token address for pricing
        underlyingForPrice: config.underlying || (underlyingTokens[i] || poolAddr),
        decimals: Math.pow(10, decimalsData[i]),
        totalSupply: Number(totalSupplies[i]),
        supplyRate: Number(supplyRates[i]),
        // Real borrowing data from contract
        availableLiquidity: Number(availableLiquidities[i]),
        totalBorrowed: Number(totalBorrowedAmounts[i]),
        baseInterestRate: Number(baseInterestRates[i]),
        dieselRate: Math.pow(10, 27), // Default 1:1 rate for Plasma
        withdrawFee: 0,
      };
    });

    console.log(`✅ Successfully fetched ${pools.length} ${chain} pools`);
    return pools;
  } catch (error) {
    console.error(`Error fetching ${chain} pools:`, error.message);
    return [];
  }
}

async function getPoolsV3(chain) {
  // Handle non-registry chains using the individual pool approach
  if (chain === 'plasma' || chain === 'etlk' || chain === 'lisk' || chain === 'hemi' || chain === 'monad') {
    return await getPlasmaPoolsV3(chain);
  }

  const chainConfig = CHAIN_CONFIGS[chain];

  // Check if there are manual pools configured for this chain
  const manualPools = chainConfig?.POOLS || {};
  const hasManualPools = Object.keys(manualPools).length > 0;

  // If there are manual pools, fetch them using the Plasma approach
  let manualPoolsData = [];
  if (hasManualPools) {
    manualPoolsData = await getPlasmaPoolsV3(chain);
  }

  // Original Ethereum implementation with registry
  const stakedDieselTokens = [
    '0x9ef444a6d7F4A5adcd68FD5329aA5240C90E14d2',
    // sdUSDCV3
    '0xA8cE662E45E825DAF178DA2c8d5Fae97696A788A',
    // sdWBTCV3
    '0x0418fEB7d0B25C411EB77cD654305d29FcbFf685',
    // sdWETHV3
    '0x16adAb68bDEcE3089D4f1626Bb5AEDD0d02471aD',
    // sdUSDTV3
    '0xE2037090f896A858E3168B978668F22026AC52e7',
    // sdGHOV3
    '0xC853E4DA38d9Bd1d01675355b8c8f3BBC1451973',
    // sdDAIV3
  ];
  const [farmInfos, totalSupplies, poolV3Addrs] = await Promise.all([
    multiCall({
      abi: abis_default.farmInfo,
      calls: stakedDieselTokens.map((target) => ({ target })),
      chain,
    }),
    multiCall({
      abi: abis_default.totalSupply,
      calls: stakedDieselTokens.map((target) => ({ target })),
      chain,
    }),
    multiCall({
      abi: abis_default.stakingToken,
      calls: stakedDieselTokens.map((target) => ({ target })),
      chain,
    }),
  ]);
  const farmingPoolsData = {};
  for (let i = 0; i < stakedDieselTokens.length; i++) {
    farmingPoolsData[poolV3Addrs[i]] = {
      stakedDieselToken: stakedDieselTokens[i],
      stakedDieselTokenSupply: Number(totalSupplies[i]),
      farmInfo: {
        balance: Number(farmInfos[i].balance),
        duration: Number(farmInfos[i].duration),
        finished: Number(farmInfos[i].finished),
        reward: Number(farmInfos[i].reward),
      },
    };
  }
  const dc300 = await call({
    abi: abis_default.getAddressOrRevert,
    target: chainConfig.ADDRESS_PROVIDER_V3,
    params: [
      // cast format-bytes32-string "DATA_COMPRESSOR"
      '0x444154415f434f4d50524553534f520000000000000000000000000000000000',
      300,
    ],
    chain,
  });
  const pools = await call({
    target: dc300,
    abi: abis_default.getPoolsV3List,
    chain,
  });
  const decimals = await multiCall({
    abi: abis_default.decimals,
    calls: pools.map((p) => ({
      target: p.dieselToken,
    })),
    chain,
  });
  const registryPools = pools
    .map((pool, i) => ({
      pool: pool.addr,
      name: pool.name,
      availableLiquidity: Number(pool.availableLiquidity),
      totalBorrowed: Number(pool.totalBorrowed),
      supplyRate: Number(pool.supplyRate),
      baseInterestRate: Number(pool.baseInterestRate),
      dieselRate: Number(pool.dieselRate_RAY),
      underlying: pool.underlying,
      withdrawFee: Number(pool.withdrawFee),
      symbol: pool.symbol,
      decimals: Math.pow(10, decimals[i]),
      ...farmingPoolsData[pool.addr],
    }))
    .filter(({ pool }) => {
      const excludedPools = chainConfig?.EXCLUDED_POOLS || {};
      return !excludedPools[pool.toLowerCase()];
    });

  // Merge registry pools with manual pools, with manual pools taking precedence
  if (hasManualPools) {
    const poolMap = new Map();
    // Add registry pools first
    for (const pool of registryPools) {
      poolMap.set(pool.pool.toLowerCase(), pool);
    }
    // Add or override with manual pools
    for (const pool of manualPoolsData) {
      const key = pool.pool.toLowerCase();
      poolMap.set(key, { ...(poolMap.get(key) || {}), ...pool });
    }
    return Array.from(poolMap.values());
  }

  return registryPools;
}
async function getTokensData(chain, pools) {
  // For non-registry chains, we need to use known token addresses for pricing
  let tokens;
  if (chain === 'plasma' || chain === 'etlk' || chain === 'lisk' || chain === 'hemi' || chain === 'monad') {
    tokens = pools.map((p) => p.underlyingForPrice || p.underlying);
  } else {
    tokens = pools.map((p) => p.underlying);
  }

  const chainConfig = CHAIN_CONFIGS[chain];

  // Add chain-specific reward tokens
  if (chainConfig?.GEAR_TOKEN) {
    tokens.push(chainConfig.GEAR_TOKEN);
  }
  if (chainConfig?.WXPL_TOKEN) {
    tokens.push(chainConfig.WXPL_TOKEN);
  }
  if (chainConfig?.REWARD_TOKEN) {
    tokens.push(chainConfig.REWARD_TOKEN);
  }

  // Add chain-specific extra reward tokens
  const chainExtraRewards = EXTRA_REWARDS[chain] || {};
  tokens.push(
    ...Object.values(chainExtraRewards).flatMap((poolExtras) =>
      poolExtras.map(({ token }) => token)
    )
  );

  tokens = Array.from(new Set(tokens.map((t) => t.toLowerCase()).filter(Boolean)));

  // Use the appropriate chain for pricing
  const prices = await fetchLLamaPrices(chain, tokens);
  const symbols = await multiCall({
    abi: abis_default.symbol,
    calls: tokens.map((target) => ({ target })),
    chain,
  });
  const decimals = await multiCall({
    abi: abis_default.decimals,
    calls: tokens.map((target) => ({ target })),
    chain,
  });
  const result = {};
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    result[token] = {
      symbol: symbols[i],
      decimals: Math.pow(10, decimals[i]),
      price: prices[token],
    };
  }
  return result;
}
function calcApyV3(info, supply, rewardPrice) {
  if (!info) return 0;
  const now = Math.floor(Date.now() / 1e3);

  // Convert all values to Numbers for safer calculation
  const finished = Number(info.finished || 0);
  const amount = Number(supply.amount || 0);
  const price = Number(supply.price || 0);
  const decimals = Number(supply.decimals || 1);
  const reward = Number(info.reward || 0);
  const duration = Number(info.duration || 1);
  const rewardPriceNum = Number(rewardPrice || 0);

  if (finished <= now) {
    return 0;
  }
  if (amount <= 0) {
    return 0;
  }
  if (price === 0 || rewardPriceNum === 0) {
    return 0;
  }
  if (duration === 0) {
    return 0;
  }

  const supplyUsd = (price * amount) / decimals;
  const rewardUsd = (rewardPriceNum * reward) / WAD;
  const secondsPerYear = SECONDS_PER_YEAR;
  const percentageFactor = PERCENTAGE_FACTOR;

  return (
    (percentageFactor * rewardUsd * secondsPerYear) /
    (supplyUsd * duration)
  ) / 100;
}
function calculateTvl(availableLiquidity, totalBorrowed, price, decimals) {
  return (((Number(availableLiquidity) + Number(totalBorrowed)) / Number(decimals)) * Number(price)) / WAD;
}
async function getApyV3(pools, tokens, daoFees, chain, merklRewards = {}) {
  const chainConfig = CHAIN_CONFIGS[chain];

  return pools.map((pool) => {
    const underlying = pool.underlying.toLowerCase();
    const poolAddr = pool.pool.toLowerCase();
    // For non-registry chains, use the underlyingForPrice token for pricing
    const priceToken = (chain === 'plasma' || chain === 'etlk' || chain === 'lisk' || chain === 'hemi' || chain === 'monad') && pool.underlyingForPrice ?
      pool.underlyingForPrice.toLowerCase() : underlying;
    const underlyingPrice = tokens[priceToken]?.price || 0;
    const daoFee = Number(daoFees[poolAddr] ?? 0);

    // Calculate TVL and borrowing data using the same logic for all chains
    let totalSupplyUsd, totalBorrowUsd, tvlUsd;

    if (chain === 'plasma' || chain === 'etlk' || chain === 'lisk' || chain === 'hemi' || chain === 'monad') {
      // Use proper Gearbox calculation for non-registry chains with real borrowing data
      totalSupplyUsd = calculateTvl(
        pool.availableLiquidity,
        pool.totalBorrowed,
        underlyingPrice,
        pool.decimals
      );
      totalBorrowUsd = calculateTvl(
        0,
        pool.totalBorrowed,
        underlyingPrice,
        pool.decimals
      );
      tvlUsd = totalSupplyUsd - totalBorrowUsd;
    } else {
      // Original Ethereum calculation
      totalSupplyUsd = calculateTvl(
        pool.availableLiquidity,
        pool.totalBorrowed,
        underlyingPrice,
        pool.decimals
      );
      totalBorrowUsd = calculateTvl(
        0,
        pool.totalBorrowed,
        underlyingPrice,
        pool.decimals
      );
      tvlUsd = totalSupplyUsd - totalBorrowUsd;
    }

    const dieselPrice = (chain === 'plasma' || chain === 'etlk' || chain === 'lisk' || chain === 'hemi' || chain === 'monad') ?
      Number(underlyingPrice) / WAD : // For non-registry chains, use simpler calculation
      (Number(underlyingPrice) * Number(pool.dieselRate)) / RAY;
    const supplyInfo = {
      amount: Number(pool.stakedDieselTokenSupply || pool.totalSupply || 0),
      decimals: Number(pool.decimals || 1),
      price: Number(dieselPrice || 0),
    };

    // Calculate reward APY
    let apyRewardTotal = 0;
    const rewardTokens = [];
    const extraRewardTokens = [];

    // Add GEAR token rewards if available on this chain
    if (chainConfig?.GEAR_TOKEN && tokens[chainConfig.GEAR_TOKEN]) {
      rewardTokens.push(chainConfig.GEAR_TOKEN);
      apyRewardTotal = calcApyV3(
        pool.farmInfo,
        supplyInfo,
        tokens[chainConfig.GEAR_TOKEN].price
      );
    }

    // Add extra rewards for this chain and pool
    for (const { token, getFarmInfo } of getExtraRewards(chain, poolAddr)) {
      extraRewardTokens.push(token);
      const farmInfo = getFarmInfo(
        Math.floor(new Date().getTime() / 1e3)
      );
      const apyReward = calcApyV3(farmInfo, supplyInfo, tokens[token]?.price || 0);
      apyRewardTotal += apyReward;
    }

    // Add Merkl rewards for supported chains
    const merklReward = merklRewards[poolAddr];
    if (merklReward && merklReward.apr > 0) {
      // Use the reward token from merklReward itself
      extraRewardTokens.push(merklReward.rewardToken);
      apyRewardTotal += merklReward.apr;
    }
    return {
      pool: poolAddr,
      chain: chainConfig.chainName,
      project: 'gearbox',
      symbol: tokens[underlying]?.symbol || pool.symbol || 'Unknown',
      tvlUsd: Number(tvlUsd) || 0,
      apyBase: (Number(pool.supplyRate) / 1e27) * 100,
      apyReward: apyRewardTotal,
      underlyingTokens: [pool.underlying],
      rewardTokens: [...rewardTokens, ...extraRewardTokens],
      url: getPoolUrl(chain, pool.pool),
      // daoFee here is taken from last cm connected to this pool. in theory, it can be different for different CMs
      // in practice, it's 25% for v3 cms and 50% for v2 cms
      apyBaseBorrow: (chain === 'plasma' || chain === 'etlk' || chain === 'lisk' || chain === 'hemi' || chain === 'monad') ?
        // For non-registry chains, use base interest rate directly (no DAO fees initially)
        (Number(pool.baseInterestRate) / 1e27) * 100 :
        ((daoFee + PERCENTAGE_FACTOR) *
          (Number(pool.baseInterestRate) / 1e27)) /
        100,
      apyRewardBorrow: 0,
      totalSupplyUsd: Number(totalSupplyUsd) || 0,
      totalBorrowUsd: Number(totalBorrowUsd) || 0,
      ltv: 0,
    };
  });
}
async function getApy() {
  const supportedChains = ['ethereum', 'plasma', 'etlk', 'lisk', 'hemi', 'monad'];
  const allPools = [];

  console.log(`🚀 Fetching Gearbox data for chains: ${supportedChains.join(', ')}`);

  for (const chain of supportedChains) {
    try {
      console.log(`🔍 Processing ${chain}...`);

      const [daoFees, v3Pools, merklRewards] = await Promise.all([
        getPoolsDaoFees(chain),
        getPoolsV3(chain),
        getMerklRewards(chain)
      ]);

      if (v3Pools.length === 0) {
        console.log(`⚠️  No pools found for ${chain}`);
        continue;
      }

      const tokens = await getTokensData(chain, v3Pools);
      const chainPools = await getApyV3(v3Pools, tokens, daoFees, chain, merklRewards);

      console.log(`✅ ${chain}: ${chainPools.length} pools processed`);
      allPools.push(...chainPools);
    } catch (error) {
      console.error(`❌ Error processing ${chain}:`, error.message);
      // Continue with other chains even if one fails
    }
  }

  console.log(`🎉 Total pools fetched: ${allPools.length}`);
  return allPools.filter((pool) => utils.keepFinite(pool));
}
var yield_server_default = {
  timetravel: false,
  apy: getApy,
};

module.exports = yield_server_default;
