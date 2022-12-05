const sdk = require('@defillama/sdk');
const superagent = require('superagent');

const abiLendingPool = require('./abiLendingPool.json');
const abiProtocolDataProvider = require('./abiProtocolDataProvider.json');
const abiChefIncentiveController = require('./abiChefIncentiveController.json');
const utils = require('../utils');

const lendingPool = '0x2409aF0251DCB89EE3Dee572629291f9B087c668';
const protocolDataProvider = '0x17938eDE656Ca1901807abf43a6B1D138D8Cd521';
const chefIncentiveController = '0x21953192664867e19F85E96E1D1Dd79dc31cCcdB';
const lendingPoolAddressesProvider =
  '0x011c0d38da64b431a1bdfc17ad72678eabf7f1fb';
const rewardToken = '0x55c08ca52497e2f1534b59e2917bf524d4765257';

const apy = async () => {
  const chain = 'ethereum';
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
  const pricesArray = [rewardToken, ...reservesList]
    .map((t) => `${chain}:${t}`)
    .concat(['coingecko:wrapped-memory']);
  const prices = (
    await superagent.get(`https://coins.llama.fi/prices/current/${pricesArray}`)
  ).body.coins;

  const secondsPerYear = 60 * 60 * 24 * 365;
  const rewardPerYear =
    (rewardsPerSecond / 1e18) *
    secondsPerYear *
    prices[`${chain}:${rewardToken}`].price;

  return reservesList.map((t, i) => {
    const price =
      // wmemo no price via chain:address but only via cg id
      t === '0x3b79a28264fC52c7b4CEA90558AA0B162f7Faf57'
        ? prices['coingecko:wrapped-memory']?.price
        : prices[`${chain}:${t}`]?.price;

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
      100;

    const apyRewardBorrow =
      (((poolInfoDebt[i].allocPoint / totalAllocPoint) * rewardPerYear) /
        totalBorrowUsd) *
      100;

    // ltv
    const ltv = reserveConfigurationData[i].ltv / 1e4;

    // url for pools
    const url =
      `https://app.uwulend.fi/reserve-overview/${t}-${t}${lendingPoolAddressesProvider}`.toLowerCase();

    return {
      pool: reserveData[i].aTokenAddress,
      symbol: utils.formatSymbol(symbols[i]),
      project: 'uwu-lend',
      chain: 'Ethereum',
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
