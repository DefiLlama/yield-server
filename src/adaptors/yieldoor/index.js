const { request, gql } = require('graphql-request');
const superagent = require('superagent');
const { formatChain, getPrices, getERC4626Info } = require('../utils');
const BigNumber = require('bignumber.js');
const { formatCollectsQuery } = require('./queries');
const sdk = require('@defillama/sdk');

const PROJECT_NAME = 'yieldoor';
const BASE_URL = 'https://app.yieldoor.com';
const TEN = new BigNumber(10);


const CONFIG = {
  ethereum: {
    subgraph: 'https://subgraph.satsuma-prod.com/ebe562dbf792/yieldoor--594520/yieldoor-leverager-base/version/v0.0.2/api',
    blockTime: 12,
    lendingPool: '',
    lp: [],
    looped: ['0x67d0bde18945999ff517a04fa156189a07ba6543']
  },
  base: {
    subgraph: 'https://subgraph.satsuma-prod.com/ebe562dbf792/yieldoor--594520/yieldoor-leverager-base/version/v0.0.2/api',
    uniswapSubgraph: sdk.graph.modifyEndpoint('HMuAwufqZ1YCRmzL2SfHTVkzZovC9VL2UAKhjvRqKiR1'),
    blockTime: 2,
    lendingPool: '0xa35b16cec42094f3ba4fd838b13641ec77d23f98',
    lp: {
      "0x8e16c184df379196782e943f4d5a2682a8720cc4": {
        "name": "uniswap-base-weth-usdc-0.05",
        "address": "0x8e16c184df379196782e943f4d5a2682a8720cc4",
      },
      "0x92ed462970e63b4fe955937cb1741ef5218b8e40": {
        "name": "uniswap-base-cbbtc-usdc-0.05",
        "address": "0x92ed462970e63b4fe955937cb1741ef5218b8e40",
      },
      "0x90d8da2839570901f13124ab1a83e92764c7e08f": {
        "name": "uniswap-base-weth-cbbtc-0.3",
        "address": "0x90d8da2839570901f13124ab1a83e92764c7e08f",
      },
      "0xc01403a2466aa7a52a7826a15e5e3bc6b0cd0664": {
        "name": "uniswap-base-weth-morpho-0.3",
        "address": "0xc01403a2466aa7a52a7826a15e5e3bc6b0cd0664",
      }
    },
    looped: []
  },
  sonic: {
    subgraph: 'https://subgraph.satsuma-prod.com/ebe562dbf792/yieldoor--594520/yieldoor-leverager-sonic/version/v0.0.2/api',
    uniswapSubgraph: sdk.graph.modifyEndpoint('9memxmbdvEaCBGvbtLh3MMGcLiMEHN6ooUSBiFU93g5T'),
    blockTime: 0.5,
    lendingPool: '0x2300ddbc84ee0c375920d706882b62d1babe1dcb',
    lp: {
      "0x6120de6a13e4496d6c8220bb2a0727ec6350a37f": {
        "name": "uniswap-sonic-ws-susdce-0.3",
        "address": "0x6120de6a13e4496d6c8220bb2a0727ec6350a37f",
      },
      "0xbce4fdcc570855d1f8f7aa2b29a483bdab6cc2df": {
        "name": "uniswap-sonic-ws-weth-0.3",
        "address": "0xbce4fdcc570855d1f8f7aa2b29a483bdab6cc2df",
      },
      "0x2d4d9ec91b60b2bf29ed1ec5028847dd8237cc17": {
        "name": "uniswap-sonic-usdc-weth-0.05",
        "address": "0x2d4d9ec91b60b2bf29ed1ec5028847dd8237cc17",
      }
    },
    shadowLp: {
      "0x55a9a1444dc5ffeff94090c1e31e1a0c2d5da963": {
        "name": "shadow-sonic-ws-susdce-50",
        "address": "0x55a9a1444dc5ffeff94090c1e31e1a0c2d5da963",
      },
      "0xea2dcb8f95d2582f3dfcf8fb9c13488e8dfbbfa3": {
        "name": "shadow-sonic-ws-weth-50",
        "address": "0xea2dcb8f95d2582f3dfcf8fb9c13488e8dfbbfa3",
      },
      "0xdc8bf0e7ff1742898f8e72143f0b8ab4139272e5": {
        "name": "shadow-sonic-usdc-weth-100",
        "address": "0xdc8bf0e7ff1742898f8e72143f0b8ab4139272e5",
      },
      "0x520e0c1a9071227279b1bec01e2fc93a25c5094e": {
        "name": "shadow-sonic-usdc-eurc-5",
        "address": "0x520e0c1a9071227279b1bec01e2fc93a25c5094e",
      }
    },
    looped: []
  }   
}

const abis = {
  getPrice: "function getPrice(address asset) view returns (uint256)",
  balances: "function balances() view returns (uint256, uint256)",
  positions: "function positions(uint256) view returns (address denomination, uint256 borrowedAmount, uint256 borrowedIndex, uint256 initCollateralValue, uint256 initCollateralUsd, uint256 initBorrowedUsd, uint256 shares, address vault, address token0, address token1)",
  reservesList: "function reservesList(uint256) view returns (address)",
  reserves: "function reserves(address) view returns (uint256 borrowingIndex, uint256 currentBorrowingRate, uint256 totalBorrows, address yTokenAddress, address stakingAddress, uint256 reserveCapacity, (uint256 utilizationA, uint256 borrowingRateA, uint256 utilizationB, uint256 borrowingRateB, uint256 maxBorrowingRate) borrowingRateConfig, (uint256 maxIndividualBorrow, uint256 LTV, uint256 LLTV) leverageParams, uint256 underlyingBalance, uint128 lastUpdateTimestamp, (bool isActive, bool frozen, bool borrowingEnabled) flags)",
  getVestingAmounts: "function getVestingAmounts() view returns (uint256, uint256)"
}

const getDailyFees = async (graphUrl, vault, pool, strategy, block, prices, vaultsData) => {
  let feeDataToken0 = new BigNumber(0);
  let feeDataToken1 = new BigNumber(0);
  let data;
  try {
    data = await request(graphUrl, formatCollectsQuery(pool.toLowerCase(), strategy.toLowerCase(), block));
  } catch (e) {
    console.error(e);
    return;
  }

  if (!data.pool || !data.pool.collects) {
    return;
  }

  const collects = data.pool.collects.filter(collect => {
    return !collect.transaction.burns.some(burn => burn.amount0 !== '0' || burn.amount1 !== '0')
  });

  collects.forEach(collect => {
    feeDataToken0 = new BigNumber(collect.amount0).plus(feeDataToken0);
    feeDataToken1 = new BigNumber(collect.amount1).plus(feeDataToken1);
  });

  const token0Usd = feeDataToken0.multipliedBy(prices.pricesByAddress[vaultsData[vault].token0.toLowerCase()]);
  const token1Usd = feeDataToken1.multipliedBy(prices.pricesByAddress[vaultsData[vault].token1.toLowerCase()]);

  const totalFees = token0Usd.plus(token1Usd).toNumber();
  vaultsData[vault].dailyFees = totalFees;
};


const getVaultData = async (chain, vaultsData, prices) => {
  if (Object.keys(vaultsData).length === 0) return;

  const vaultsAddresses = Object.keys(vaultsData);

  const [balances, strategies] = await Promise.all([
    sdk.api.abi.multiCall({ 
      calls: vaultsAddresses.map(addr => ({ target: addr })), 
      abi: abis.balances, 
      chain 
    }),
    sdk.api.abi.multiCall({ 
      calls: vaultsAddresses.map(addr => ({ target: addr })), 
      abi: 'address:strategy', 
      chain 
    })
  ])

  Object.keys(vaultsData).forEach((vault, i) => {
    const { token0, token1 } = vaultsData[vault];
    const [b0, b1] = balances.output[i].output;
    const token0Usd = new BigNumber(b0).dividedBy(TEN.pow(vaultsData[vault].token0Decimals)).multipliedBy(prices.pricesByAddress[token0.toLowerCase()]);
    const token1Usd = new BigNumber(b1).dividedBy(TEN.pow(vaultsData[vault].token1Decimals)).multipliedBy(prices.pricesByAddress[token1.toLowerCase()]);
    const totalBalance = token0Usd.plus(token1Usd).toNumber();
    vaultsData[vault].totalBalanceUsd = totalBalance;
    vaultsData[vault].strategy = strategies.output[i].output;
  });

  const strategyAddresses = Object.keys(vaultsData).map(vault => vaultsData[vault].strategy);
  const [protocolFees, pools] = await Promise.all([
    sdk.api.abi.multiCall({ 
      calls: strategyAddresses.map(addr => ({ target: addr })), 
      abi: 'uint256:protocolFee', 
      chain 
    }),
    sdk.api.abi.multiCall({ 
      calls: strategyAddresses.map(addr => ({ target: addr })), 
      abi: 'address:pool', 
      chain 
    })
  ]);

  Object.keys(vaultsData).forEach((vault, i) => {
    vaultsData[vault].protocolFee = protocolFees.output[i].output;
    vaultsData[vault].pool = pools.output[i].output;
  });
}

const getShadowVaultData = async (chain, vaultsData, prices) => {
  const vaults = Object.keys(vaultsData);
  const [vestingAmounts] = await Promise.all([
    sdk.api.abi.multiCall({ 
      calls: vaults.map(vault => ({ target: vaultsData[vault].strategy })), 
      abi: abis.getVestingAmounts, 
      chain 
    })
  ]);

  vaults.forEach((vault, i) => {
    const [vestingAmount0, vestingAmount1] = vestingAmounts.output[i].output;
    const token0Usd = new BigNumber(vestingAmount0).dividedBy(TEN.pow(vaultsData[vault].token0Decimals)).times(prices.pricesByAddress[vaultsData[vault].token0.toLowerCase()]);
    const token1Usd = new BigNumber(vestingAmount1).dividedBy(TEN.pow(vaultsData[vault].token1Decimals)).times(prices.pricesByAddress[vaultsData[vault].token1.toLowerCase()]);
    const dailyRewards = token0Usd.plus(token1Usd).toNumber();
    vaultsData[vault].dailyRewards = dailyRewards;
    vaultsData[vault].apy = dailyRewards * 365 / vaultsData[vault].totalBalanceUsd;
  });
}

const getBlockDayAgo = async (chain) => {
  const block = await sdk.api.util.getLatestBlock(chain);
  const blockTime = CONFIG[chain].blockTime;
  const blocksPerDay = 86400 / blockTime;
  const blockDayAgo = block.number - blocksPerDay;
  return blockDayAgo;
}

const getUniqueTokensPrices = async (lps, chain) => {
  
  const vaults = Object.keys(lps);
  const [token0s, token1s] = await Promise.all([
    sdk.api.abi.multiCall({ 
      calls: vaults.map(addr => ({ target: addr })), 
      abi: 'address:token0', 
      chain 
    }),
    sdk.api.abi.multiCall({ 
      calls: vaults.map(addr => ({ target: addr })), 
      abi: 'address:token1', 
      chain 
    })
  ]);

  const vaultsData = {};
  vaults.forEach((vault, i) => {
    vaultsData[vault] = {
      token0: token0s.output[i].output,
      token1: token1s.output[i].output
    }
  });

  const [decimals0, symbols0, decimals1, symbols1] = await Promise.all([
    sdk.api.abi.multiCall({ 
      calls: vaults.map(vault => ({ target: vaultsData[vault].token0 })), 
      abi: 'uint256:decimals', 
      chain 
    }),
    sdk.api.abi.multiCall({
      calls: vaults.map(vault => ({ target: vaultsData[vault].token0 })),
      abi: 'string:symbol',
      chain
    }),
    sdk.api.abi.multiCall({ 
      calls: vaults.map(vault => ({ target: vaultsData[vault].token1 })), 
      abi: 'uint256:decimals', 
      chain 
    }),
    sdk.api.abi.multiCall({
      calls: vaults.map(vault => ({ target: vaultsData[vault].token1 })),
      abi: 'string:symbol',
      chain
    })
  ]);

  vaults.forEach((vault, i) => {
    vaultsData[vault].token0Decimals = decimals0.output[i].output;
    vaultsData[vault].token1Decimals = decimals1.output[i].output;
    vaultsData[vault].token0Symbol = symbols0.output[i].output;
    vaultsData[vault].token1Symbol = symbols1.output[i].output;
  });

  const uniqueTokens = [...new Set([...token0s.output.map(t => t.output), ...token1s.output.map(t => t.output)])];
  const prices = await getPrices(uniqueTokens, chain);

  return [prices, vaultsData];
}

const calculatePoolsApy = (vaultsData) => {
  Object.keys(vaultsData).map(vault => {
    let yearlyFees = vaultsData[vault].dailyFees * 365;
    if (vaultsData[vault].protocolFee) {
      const protocolFeePercent = new BigNumber(vaultsData[vault].protocolFee.toString()).dividedBy(10000); // Assuming fee is in basis points (10000 = 100%)
      yearlyFees = (new BigNumber(1).minus(protocolFeePercent)).times(yearlyFees);
    }
    vaultsData[vault].apy = yearlyFees.dividedBy(vaultsData[vault].totalBalanceUsd).toNumber();
  });
}

const getLpData = async (chain) => {
  const { lp, looped, lendingPool, uniswapSubgraph } = CONFIG[chain];

  const [prices, vaultsData] = await getUniqueTokensPrices(lp, chain);
  
  await getVaultData(chain, vaultsData, prices);

  const blockDayAgo = await getBlockDayAgo(chain);

  await Promise.all(
    Object.keys(vaultsData).map(async (vault) => {
      await getDailyFees(uniswapSubgraph, vault, vaultsData[vault].pool, vaultsData[vault].strategy, blockDayAgo, prices, vaultsData);
  }));

  calculatePoolsApy(vaultsData);

  return Object.keys(vaultsData).map(vault => {
    return {
      pool: vault,  
      chain: formatChain(chain),
      project: PROJECT_NAME,
      underlyingTokens: [vaultsData[vault].token0, vaultsData[vault].token1],
      symbol: `yldr-${vaultsData[vault].token0Symbol}-${vaultsData[vault].token1Symbol}`,
      tvlUsd: vaultsData[vault].totalBalanceUsd || 0,
      apyBase: 100 * vaultsData[vault].apy || 0,
      url: `${BASE_URL}/vaults/${lp[vault].name}`
    }
  });
}

const getShadowLpData = async (chain) => {
  const { shadowLp, lendingPool, subgraph } = CONFIG[chain];

  if (!shadowLp || Object.keys(shadowLp).length === 0) {
    return [];
  }

  const [prices, vaultsData] = await getUniqueTokensPrices(shadowLp, chain);
  
  await getVaultData(chain, vaultsData, prices);

  await getShadowVaultData(chain, vaultsData, prices);

  return Object.keys(vaultsData).map(vault => {
    return {
      pool: vault,
      chain: formatChain(chain),
      project: PROJECT_NAME,
      underlyingTokens: [vaultsData[vault].token0, vaultsData[vault].token1],
      symbol: `${vaultsData[vault].token0Symbol}-${vaultsData[vault].token1Symbol}`,
      tvlUsd: vaultsData[vault].totalBalanceUsd || 0,
      apyBase: 100 * vaultsData[vault].apy || 0,
      url: `${BASE_URL}/vaults/${shadowLp[vault].name}`
    }
  });
}

const apy = async () => {
  const lp = Object.keys(CONFIG).map(async chain => getLpData(chain));
  const shadowLp = [getShadowLpData("sonic")];

  const [lpResults, shadowLpResults] = await Promise.all([
    Promise.all(lp),
    Promise.all(shadowLp)
  ]);

  const pools = [...lpResults.flat(), ...shadowLpResults.flat()];
  return pools;
};

module.exports = { apy };
