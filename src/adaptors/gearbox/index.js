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
var ADDRESS_PROVIDER_V3 = '0x9ea7b04da02a5373317d745c1571c84aad03321d';
var GEAR_TOKEN = '0xBa3335588D9403515223F109EdC4eB7269a9Ab5D'.toLowerCase();
var GHO_TOKEN = '0x40D16FC0246aD3160Ccc09B8D0D3A2cD28aE6C2f'.toLowerCase();
var POOL_USDT_V3_BROKEN =
  '0x1dc0f3359a254f876b37906cfc1000a35ce2d717'.toLowerCase();
var POOL_GHO_V3 = '0x4d56c9cBa373AD39dF69Eb18F076b7348000AE09'.toLowerCase();

// src/yield-server/extraRewards.ts
var EXTRA_REWARDS = {
  [POOL_GHO_V3]: [
    {
      token: GHO_TOKEN,
      getFarmInfo: (timestamp) => {
        const GHO_DECIMALS = 10n ** 18n;
        const REWARD_PERIOD = 14n * 24n * 60n * 60n;
        const REWARDS_FIRST_START = 1711448651n;
        const REWARDS_FIRST_END = REWARDS_FIRST_START + REWARD_PERIOD;
        const REWARDS_SECOND_END = REWARDS_FIRST_END + REWARD_PERIOD;
        const REWARD_FIRST_PART = 15000n * GHO_DECIMALS;
        const REWARD_SECOND_PART = 10000n * GHO_DECIMALS;
        const reward =
          timestamp >= REWARDS_FIRST_END
            ? REWARD_SECOND_PART
            : REWARD_FIRST_PART;
        return {
          balance: 0n,
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
};

// src/yield-server/index.ts
var SECONDS_PER_YEAR = 365n * 24n * 60n * 60n;
var WAD = 10n ** 18n;
var RAY = 10n ** 27n;
var PERCENTAGE_FACTOR = 10000n;
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
    prices[address.toLowerCase()] = BigInt(Number(WAD) * info.price);
  }
  return prices;
}
async function getPoolsDaoFees(chain) {
  const contractsRegisterAddr = await call({
    abi: abis_default.getAddressOrRevert,
    target: ADDRESS_PROVIDER_V3,
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
      result[pool] = BigInt(daoFee.feeInterest);
    }
  }
  return result;
}
async function getPoolsV3(chain) {
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
      stakedDieselTokenSupply: BigInt(totalSupplies[i]),
      farmInfo: {
        balance: BigInt(farmInfos[i].balance),
        duration: BigInt(farmInfos[i].duration),
        finished: BigInt(farmInfos[i].finished),
        reward: BigInt(farmInfos[i].reward),
      },
    };
  }
  const dc300 = await call({
    abi: abis_default.getAddressOrRevert,
    target: ADDRESS_PROVIDER_V3,
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
  return pools
    .map((pool, i) => ({
      pool: pool.addr,
      name: pool.name,
      availableLiquidity: BigInt(pool.availableLiquidity),
      totalBorrowed: BigInt(pool.totalBorrowed),
      supplyRate: BigInt(pool.supplyRate),
      baseInterestRate: BigInt(pool.baseInterestRate),
      dieselRate: BigInt(pool.dieselRate_RAY),
      underlying: pool.underlying,
      withdrawFee: BigInt(pool.withdrawFee),
      symbol: pool.symbol,
      decimals: 10n ** BigInt(decimals[i]),
      ...farmingPoolsData[pool.addr],
    }))
    .filter(({ pool }) => pool.toLowerCase() !== POOL_USDT_V3_BROKEN);
}
async function getTokensData(chain, pools) {
  let tokens = pools.map((p) => p.underlying);
  tokens.push(GEAR_TOKEN);
  tokens.push(
    ...Object.values(EXTRA_REWARDS).flatMap((poolExtras) =>
      poolExtras.map(({ token }) => token)
    )
  );
  tokens = Array.from(new Set(tokens.map((t) => t.toLowerCase())));
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
      decimals: 10n ** BigInt(decimals[i]),
      price: prices[token],
    };
  }
  return result;
}
function calcApyV3(info, supply, rewardPrice) {
  if (!info) return 0;
  const now = BigInt(Math.floor(Date.now() / 1e3));
  if (info.finished <= now) {
    return 0;
  }
  if (supply.amount <= 0n) {
    return 0;
  }
  if (supply.price === 0n || rewardPrice === 0n) {
    return 0;
  }
  if (info.duration === 0n) {
    return 0;
  }
  const supplyUsd = (supply.price * supply.amount) / supply.decimals;
  const rewardUsd = (rewardPrice * info.reward) / WAD;
  return (
    Number(
      (PERCENTAGE_FACTOR * rewardUsd * SECONDS_PER_YEAR) /
        (supplyUsd * info.duration)
    ) / 100
  );
}
function calculateTvl(availableLiquidity, totalBorrowed, price, decimals) {
  return (((availableLiquidity + totalBorrowed) / decimals) * price) / WAD;
}
function getApyV3(pools, tokens, daoFees) {
  return pools.map((pool) => {
    const underlying = pool.underlying.toLowerCase();
    const poolAddr = pool.pool.toLowerCase();
    const underlyingPrice = tokens[underlying].price;
    const daoFee = daoFees[poolAddr] ?? 0;
    const totalSupplyUsd = calculateTvl(
      pool.availableLiquidity,
      pool.totalBorrowed,
      underlyingPrice,
      pool.decimals
    );
    const totalBorrowUsd = calculateTvl(
      0n,
      pool.totalBorrowed,
      underlyingPrice,
      pool.decimals
    );
    const tvlUsd = totalSupplyUsd - totalBorrowUsd;
    const dieselPrice = (underlyingPrice * pool.dieselRate) / RAY;
    const supplyInfo = {
      amount: pool.stakedDieselTokenSupply,
      decimals: pool.decimals,
      price: dieselPrice,
    };
    let apyRewardTotal = calcApyV3(
      pool.farmInfo,
      supplyInfo,
      tokens[GEAR_TOKEN].price
    );
    const extraRewardTokens = [];
    for (const { token, getFarmInfo } of EXTRA_REWARDS[poolAddr] ?? []) {
      extraRewardTokens.push(token);
      const farmInfo = getFarmInfo(
        BigInt(Math.floor(/* @__PURE__ */ new Date().getTime() / 1e3))
      );
      const apyReward = calcApyV3(farmInfo, supplyInfo, tokens[token].price);
      apyRewardTotal += apyReward;
    }
    return {
      pool: poolAddr,
      chain: 'Ethereum',
      project: 'gearbox',
      symbol: tokens[underlying].symbol,
      tvlUsd: Number(tvlUsd),
      apyBase: (Number(pool.supplyRate) / 1e27) * 100,
      apyReward: apyRewardTotal,
      underlyingTokens: [pool.underlying],
      rewardTokens: [GEAR_TOKEN, ...extraRewardTokens],
      url: `https://app.gearbox.fi/pools/${pool.pool}`,
      // daoFee here is taken from last cm connected to this pool. in theory, it can be different for different CMs
      // in practice, it's 25% for v3 cms and 50% for v2 cms
      apyBaseBorrow:
        (Number(daoFee + PERCENTAGE_FACTOR) *
          (Number(pool.baseInterestRate) / 1e27)) /
        100,
      apyRewardBorrow: 0,
      totalSupplyUsd: Number(totalSupplyUsd),
      totalBorrowUsd: Number(totalBorrowUsd),
      ltv: 0,
      // this is currently just for the isolated earn page
    };
  });
}
async function getApy() {
  const daoFees = await getPoolsDaoFees('ethereum');
  const v3Pools = await getPoolsV3('ethereum');
  const tokens = await getTokensData('ethereum', v3Pools);
  const pools = getApyV3(v3Pools, tokens, daoFees);
  return pools.filter((i) => utils.keepFinite(i));
}
var yield_server_default = {
  timetravel: false,
  apy: getApy,
};

module.exports = yield_server_default;
