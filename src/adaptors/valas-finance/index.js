const sdk = require('@defillama/sdk');
const superagent = require('superagent');

const abiLendingPool = require('./abiLendingPool.json');
const abiProtocolDataProvider = require('./abiProtocolDataProvider.json');
const abiChefIncentiveController = require('./abiChefIncentiveController.json');
const utils = require('../utils');

const lendingPool = '0xE29A55A6AEFf5C8B1beedE5bCF2F0Cb3AF8F91f5';
const protocolDataProvider = '0xc9704604E18982007fdEA348e8DDc7CC652E34cA';
const chefIncentiveController = '0xB7c1d99069a4eb582Fc04E7e1124794000e7ecBF';
const lendingPoolAddressesProvider =
  '0x0736B3dAdDe5B78354BF7F7faaFAcEE82B1851b9';
const rewardToken = '0xb1ebdd56729940089ecc3ad0bbeeb12b6842ea6f';

// valas has an early exit penalty of 75% -> 25% of the rewards are left
const earlyExitPenalty = 1 - 0.75;

const apy = async () => {
  const chain = 'bsc';
  // underlying pools
  const reservesList = (
    await sdk.api.abi.call({
      target: lendingPool,
      chain,
      abi: abiLendingPool.find((n) => n.name === 'getReservesList'),
    })
  ).output;

  // supply and borrow base rate, interest and debt addresses
  const reserveData = (
    await sdk.api.abi.multiCall({
      calls: reservesList.map((t) => ({ target: lendingPool, params: t })),
      chain,
      abi: abiLendingPool.find((n) => n.name === 'getReserveData'),
    })
  ).output.map((o) => o.output);

  // available
  const [liquidityRes, decimalsRes, symbolsRes] = await Promise.all(
    ['erc20:balanceOf', 'erc20:decimals', 'erc20:symbol'].map((method) =>
      sdk.api.abi.multiCall({
        abi: method,
        calls: reservesList.map((t, i) => ({
          target: t,
          params:
            method === 'erc20:balanceOf' ? reserveData[i].aTokenAddress : null,
        })),
        chain,
      })
    )
  );
  const liquidity = liquidityRes.output.map((o) => o.output);
  const decimals = decimalsRes.output.map((o) => o.output);
  const symbols = symbolsRes.output.map((o) => o.output);

  // borrowed
  const totalBorrow = (
    await sdk.api.abi.multiCall({
      abi: 'erc20:totalSupply',
      calls: reserveData.map((p) => ({ target: p.variableDebtTokenAddress })),
      chain,
    })
  ).output.map((o) => o.output);

  // ltv
  const reserveConfigurationData = (
    await sdk.api.abi.multiCall({
      calls: reservesList.map((t) => ({
        target: protocolDataProvider,
        params: t,
      })),
      chain,
      abi: abiProtocolDataProvider.find(
        (n) => n.name === 'getReserveConfigurationData'
      ),
    })
  ).output.map((o) => o.output);

  // --- rewards
  const rewardsPerSecond = (
    await sdk.api.abi.call({
      abi: abiChefIncentiveController.find(
        (n) => n.name === 'rewardsPerSecond'
      ),
      target: chefIncentiveController,
      chain,
    })
  ).output;

  const totalAllocPoint = (
    await sdk.api.abi.call({
      abi: abiChefIncentiveController.find((n) => n.name === 'totalAllocPoint'),
      target: chefIncentiveController,
      chain,
    })
  ).output;

  // poolInfo (alloc point)
  // need to run this twice,
  // once for inteteres bearing and another time for debt bearing tokens
  const poolInfoInterest = (
    await sdk.api.abi.multiCall({
      abi: abiChefIncentiveController.find((n) => n.name === 'poolInfo'),
      calls: reserveData.map((t, i) => ({
        target: chefIncentiveController,
        params: reserveData[i].aTokenAddress,
      })),
      chain,
    })
  ).output.map((o) => o.output);

  const poolInfoDebt = (
    await sdk.api.abi.multiCall({
      abi: abiChefIncentiveController.find((n) => n.name === 'poolInfo'),
      calls: reserveData.map((t, i) => ({
        target: chefIncentiveController,
        params: reserveData[i].variableDebtTokenAddress,
      })),
      chain,
    })
  ).output.map((o) => o.output);

  // prices
  const pricesArray = [rewardToken, ...reservesList].map(
    (t) => `${chain}:${t}`
  );
  const prices = (
    await superagent.get(`https://coins.llama.fi/prices/current/${pricesArray}`)
  ).body.coins;

  const secondsPerYear = 60 * 60 * 24 * 365;
  const rewardPerYear =
    (rewardsPerSecond / 1e18) *
    secondsPerYear *
    prices[`${chain}:${rewardToken}`].price;

  return reservesList.map((t, i) => {
    const price = prices[`${chain}:${t}`]?.price;

    // tvl data
    const tvlUsd = (liquidity[i] / 10 ** decimals[i]) * price;
    const totalBorrowUsd = (totalBorrow[i] / 10 ** decimals[i]) * price;
    const totalSupplyUsd = tvlUsd + totalBorrowUsd;

    // apy base
    const apyBase = reserveData[i].currentLiquidityRate / 1e25;
    const apyBaseBorrow = reserveData[i].currentVariableBorrowRate / 1e25;

    // apy reward
    const apyReward =
      (((poolInfoInterest[i].allocPoint / totalAllocPoint) * rewardPerYear) /
        totalSupplyUsd) *
      100 *
      earlyExitPenalty;

    const apyRewardBorrow =
      (((poolInfoDebt[i].allocPoint / totalAllocPoint) * rewardPerYear) /
        totalBorrowUsd) *
      100 *
      earlyExitPenalty;

    // ltv
    const ltv = reserveConfigurationData[i].ltv / 1e4;

    // url for pools
    const url = `https://valasfinance.com/reserve-overview/${
      symbols[i]
    }-${t.toLowerCase()}${lendingPoolAddressesProvider.toLowerCase()}`;

    return {
      pool: reserveData[i].aTokenAddress,
      symbol: utils.formatSymbol(symbols[i]),
      project: 'valas-finance',
      chain: utils.formatChain(chain),
      tvlUsd,
      apyBase,
      apyReward,
      underlyingTokens: [t],
      rewardTokens: [rewardToken],
      url,
      // borrow fields
      totalSupplyUsd,
      totalBorrowUsd,
      apyBaseBorrow,
      apyRewardBorrow,
      ltv,
    };
  });
};

module.exports = {
  timetravel: false,
  apy,
};
