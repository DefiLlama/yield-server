const sdk = require('@defillama/sdk');
const superagent = require('superagent');

const abiLendingPool = require('./abiLendingPool.json');
const abiProtocolDataProvider = require('./abiProtocolDataProvider.json');
const abiChefIncentiveController = require('./abiChefIncentiveController.json');
const utils = require('../utils');

const lendingPool = '0x1b9c074111ec65E1342Ea844f7273D5449D2194B';
const protocolDataProvider = '0x1C08Af0455A4D90667172D87D23E60669f90eA4E';
const chefIncentiveController = '0x422ABB57E4Bb7D46032852b884b7bB4Cc4A39CC7';
const lendingPoolAddressesProvider =
  '0x78b6ADDE60A9181C1889913D31906bbF5C3795dD';
const rewardToken = '0xd109065ee17e2dc20b3472a4d4fb5907bd687d09';

const synapseAssets = [
  '0x6270B58BE569a7c0b8f47594F191631Ae5b2C86C', // USDC,
  '0xd6dAb4CfF47dF175349e6e7eE2BF7c40Bb8C05A3', // USDT,
  '0xDCbacF3f7a069922E677912998c8d57423C37dfA', // WBTC
  '0xCD6f29dC9Ca217d0973d3D21bF58eDd3CA871a86', // WETH
  '0x078dB7827a5531359f6CB63f62CFA20183c4F10c', // DAI
];

const apy = async () => {
  const chain = 'klaytn';
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
      abi: abiChefIncentiveController.find(
        (n) => n.name === 'totalAllocPoints'
      ),
      target: chefIncentiveController,
      chain,
    })
  ).output;

  // allocPoints (poolInfo is available but doesn't have allocation point value) (alloc point)
  // need to run this twice,
  // once for interest bearing and another time for debt bearing tokens
  const allocPointsInterest = (
    await sdk.api.abi.multiCall({
      abi: abiChefIncentiveController.find((n) => n.name === 'allocPoints'),
      calls: reserveData.map((t, i) => ({
        target: chefIncentiveController,
        params: reserveData[i].aTokenAddress,
      })),
      chain,
    })
  ).output.map((o) => o.output);

  const allocPointsDebt = (
    await sdk.api.abi.multiCall({
      abi: abiChefIncentiveController.find((n) => n.name === 'allocPoints'),
      calls: reserveData.map((t, i) => ({
        target: chefIncentiveController,
        params: reserveData[i].variableDebtTokenAddress,
      })),
      chain,
    })
  ).output.map((o) => o.output);

  // prices
  let pricesArray = [rewardToken, ...reservesList].map((t) => `${chain}:${t}`);
  // note: we don't have prices for many of those tokens -> defaulting to the
  // base token (eg wrapped sol on klaytn -> sol price) using gecko ids
  const geckoIds = [
    'solana',
    'wrapped-avax',
    'binance-usd',
    'wbnb',
    'tether',
  ].map((t) => `coingecko:${t}`);
  pricesArray = pricesArray.concat(geckoIds);

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
      prices[`${chain}:${t}`]?.price ??
      Object.values(prices).find((pr) => pr.symbol === symbols[i])?.price;

    // tvl data
    const tvlUsd = (liquidity[i] / 10 ** decimals[i]) * price;
    const totalBorrowUsd = (totalBorrow[i] / 10 ** decimals[i]) * price;
    const totalSupplyUsd = tvlUsd + totalBorrowUsd;

    // apy base
    const apyBase = reserveData[i].currentLiquidityRate / 1e25;
    const apyBaseBorrow = reserveData[i].currentVariableBorrowRate / 1e25;

    // apy reward
    const apyReward =
      ((((allocPointsInterest[i] / totalAllocPoint) * rewardPerYear) /
        totalSupplyUsd) *
        100) /
      2;

    const apyRewardBorrow =
      ((((allocPointsDebt[i] / totalAllocPoint) * rewardPerYear) /
        totalBorrowUsd) *
        100) /
      2;

    // ltv
    const ltv = reserveConfigurationData[i].ltv / 1e4;

    // url for pools
    const poolUrl = reservesList[i];
    const url =
      `https://app.klap.finance/reserve-overview/${poolUrl}-${poolUrl}${lendingPoolAddressesProvider}`.toLowerCase();

    return {
      pool: reserveData[i].aTokenAddress,
      symbol: utils.formatSymbol(symbols[i]),
      project: 'klap',
      chain: utils.formatChain(chain),
      tvlUsd,
      apyBase,
      apyReward,
      underlyingTokens: [t],
      rewardTokens: [rewardToken],
      poolMeta: synapseAssets.includes(t) ? 'Synapse' : null,
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
