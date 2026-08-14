const sdk = require('@defillama/sdk');
const utils = require('../utils');
const abis = require('./takara-lend.json');
const ethers = require('ethers');

const unitroller = '0x71034bf5eC0FAd7aEE81a213403c8892F3d8CAeE';
const oracle = '0xD6a275072dceC8a319c0C7178951A0CF9DCC0447';
const rewards = '0x28BF6D71b6Dc837F56F5afbF1F4A46AaC0B1f31E';
const partnerRewards = '0xD41dF247d0772207Af828Ffe732BA3c8212d6eb3';
const chain = utils.formatChain('Sei');
const sdkChain = 'sei';
const project = 'takara-lend';

const secondsPerYear = 86400n * 365n;

const comptrollerAbi = [
  {
    name: 'getAllMarkets',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'address[]' }],
  },
  {
    name: 'markets',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ type: 'address' }],
    outputs: [
      { name: 'isListed', type: 'bool' },
      { name: 'collateralFactorMantissa', type: 'uint256' },
    ],
  },
];

const tTokenAbi = [
  {
    name: 'underlying',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'address' }],
  },
  {
    name: 'getCash',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'uint256' }],
  },
  {
    name: 'totalBorrows',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'uint256' }],
  },
  {
    name: 'supplyRatePerBlock',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'uint256' }],
  },
  {
    name: 'borrowRatePerBlock',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'uint256' }],
  },
];

const erc20Abi = [
  {
    name: 'symbol',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'string' }],
  },
  {
    name: 'decimals',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'uint8' }],
  },
];

const oracleAbi = {
  name: 'getUnderlyingPrice',
  type: 'function',
  stateMutability: 'view',
  inputs: [{ type: 'address' }],
  outputs: [{ type: 'uint256' }],
};

const rewardsConfigAbi = {
  ...abis.find((m) => m.name === 'getRewardsAllMarketConfigs'),
  name: 'getAllMarketConfigs',
};

function calculateApy(ratePerSecond, compoundingsPerYear) {
  ratePerSecond = BigInt(ratePerSecond);
  compoundingsPerYear = BigInt(compoundingsPerYear);

  if (ratePerSecond === 0n) return 0;

  const SCALE = BigInt(1e18);

  function pow(base, exponent) {
    let result = SCALE;
    let basePow = base;

    while (exponent > 0n) {
      if (exponent % 2n === 1n) {
        result = (result * basePow) / SCALE;
      }
      basePow = (basePow * basePow) / SCALE;
      exponent /= 2n;
    }

    return result;
  }
  const compounded = pow(SCALE + ratePerSecond, compoundingsPerYear);
  const rawData = (compounded - SCALE) * 100n;

  const data = ethers.utils.formatEther(rawData);
  return Number(data);
}

function yearly(emissionPerSec) {
  return emissionPerSec * secondsPerYear;
}

function toBigInt(value) {
  return BigInt(value.toString());
}

function toUsdFixed18(amount, price) {
  return (toBigInt(amount) * toBigInt(price)) / 10n ** 18n;
}

function formatUsd(usdFixed18) {
  return Number(ethers.utils.formatUnits(usdFixed18, 18));
}

function calcSubsidyPct(configs, supplyUsdFixed18, oracleMap) {
  const bySymbol = new Map();
  if (supplyUsdFixed18 === 0n) return [];

  configs
    .filter((n) => BigInt(n.endTime) > BigInt(Math.floor(Date.now() / 1000)))
    .map((cfg) => {
      const oracle = oracleMap.get(cfg.emissionToken.toLowerCase());
      if (!oracle || cfg.supplyEmissionsPerSec === '0') return;

      const yearlyAmt = yearly(BigInt(cfg.supplyEmissionsPerSec));
      const yearlyUsd18 = toUsdFixed18(yearlyAmt, oracle.price);

      const pct18 = (yearlyUsd18 * 100n * 10n ** 18n) / supplyUsdFixed18;

      const prev = bySymbol.get(oracle.symbol) || {
        value: 0n,
        token: oracle.token,
      };
      bySymbol.set(oracle.symbol, { ...prev, value: prev.value + pct18 });
    });

  return Array.from(bySymbol.entries()).map(([name, subsidy]) => ({
    name,
    token: subsidy.token,
    value: Number(ethers.utils.formatUnits(subsidy.value, 18)),
  }));
}

const multiCallMarkets = async (markets, method, abi, target) =>
  (
    await sdk.api.abi.multiCall({
      chain: sdkChain,
      target,
      calls: markets.map((market) => ({ target: market })),
      abi: abi.find(({ name }) => name === method),
      permitFailure: true,
    })
  ).output.map(({ output }) => output);

const apy = async () => {
  const { output: allMarketsRes } = await sdk.api.abi.call({
    target: unitroller,
    abi: comptrollerAbi.find((m) => m.name === 'getAllMarkets'),
    chain: sdkChain,
  });
  const rTokens = Object.values(allMarketsRes);

  const [
    marketsInfo,
    underlyingTokens,
    marketsCash,
    totalBorrows,
    supplyRatePerBlock,
    borrowRatePerBlock,
    underlyingPrices,
  ] = await Promise.all([
    sdk.api.abi.multiCall({
      chain: sdkChain,
      calls: rTokens.map((market) => ({
        target: unitroller,
        params: [market],
      })),
      abi: comptrollerAbi.find(({ name }) => name === 'markets'),
      permitFailure: true,
    }),
    multiCallMarkets(rTokens, 'underlying', tTokenAbi),
    multiCallMarkets(rTokens, 'getCash', tTokenAbi),
    multiCallMarkets(rTokens, 'totalBorrows', tTokenAbi),
    multiCallMarkets(rTokens, 'supplyRatePerBlock', tTokenAbi),
    multiCallMarkets(rTokens, 'borrowRatePerBlock', tTokenAbi),
    sdk.api.abi.multiCall({
      chain: sdkChain,
      calls: rTokens.map((market) => ({
        target: oracle,
        params: [market],
      })),
      abi: oracleAbi,
      permitFailure: true,
    }),
  ]);

  const underlyingSymbols = await multiCallMarkets(
    underlyingTokens,
    'symbol',
    erc20Abi
  );

  const underlyingDecimals = await multiCallMarkets(
    underlyingTokens,
    'decimals',
    erc20Abi
  );

  const oracleMap = new Map();
  underlyingTokens.forEach((underlying, i) => {
    if (!underlying || !underlyingPrices.output[i].output) return;

    oracleMap.set(underlying.toLowerCase(), {
      token: underlying,
      price: toBigInt(underlyingPrices.output[i].output),
      decimals: Number(underlyingDecimals[i]),
      symbol: underlyingSymbols[i],
    });
  });

  const { output: partnerRaw } = await sdk.api.abi.multiCall({
    chain: sdkChain,
    abi: rewardsConfigAbi,
    target: partnerRewards,
    calls: rTokens.map((t) => ({ params: [t] })),
    permitFailure: true,
  });

  const { output: rewardsRaw } = await sdk.api.abi.multiCall({
    chain: sdkChain,
    abi: rewardsConfigAbi,
    target: rewards,
    calls: rTokens.map((t) => ({ params: [t] })),
    permitFailure: true,
  });

  const pools = rTokens
    .map((token, i) => {
      if (!underlyingTokens[i] || !underlyingPrices.output[i].output)
        return null;

      const pool = `${token}-${chain}`.toLowerCase();
      const underlyingSymbol = underlyingSymbols[i];
      const underlying = underlyingTokens[i];
      const price = toBigInt(underlyingPrices.output[i].output);
      const cashUsdFixed = toUsdFixed18(marketsCash[i], price);
      const totalBorrowUsdFixed = toUsdFixed18(totalBorrows[i], price);
      const totalSupplyUsdFixed = cashUsdFixed + totalBorrowUsdFixed;

      const tvlUsd = formatUsd(cashUsdFixed);
      const ltv = Number(
        ethers.utils.formatUnits(
          marketsInfo.output[i].output.collateralFactorMantissa,
          18
        )
      );
      const totalBorrowUsd = formatUsd(totalBorrowUsdFixed);
      const totalSupplyUsd = formatUsd(totalSupplyUsdFixed);

      const apyBase = calculateApy(supplyRatePerBlock[i], secondsPerYear);
      const apyBaseBorrow = calculateApy(borrowRatePerBlock[i], secondsPerYear);

      const url = `https://app.takaralend.com/market/${underlyingSymbol}`;

      const rewards = rewardsRaw[i].output || [];
      const partnerRewards = partnerRaw[i].output || [];

      let apyReward = 0;
      let rewardTokens = [];

      if (totalSupplyUsdFixed !== 0n) {
        const rewardList = calcSubsidyPct(
          rewards,
          totalSupplyUsdFixed,
          oracleMap
        );
        const partnerList = calcSubsidyPct(
          partnerRewards,
          totalSupplyUsdFixed,
          oracleMap
        );
        const allSubsidy = [...partnerList, ...rewardList];
        apyReward = Number(
          allSubsidy.reduce((acc, item) => acc + item.value, 0).toFixed(2)
        );
        rewardTokens = [...new Set(allSubsidy.map((o) => o.token))];
      }

      return {
        pool,
        chain,
        project,
        ltv,
        tvlUsd,
        totalSupplyUsd,
        totalBorrowUsd,
        availableBorrowUsd: tvlUsd,
        apyBase,
        apyBaseBorrow,
        borrowToken: underlying,
        borrowable: true,
        apyReward: apyReward,
        rewardTokens: rewardTokens,
        symbol: underlyingSymbol,
        underlyingTokens: [underlying],
        url,
      };
    })
    .filter(Boolean);

  return pools;
};

module.exports = {
  protocolId: '5783',
  timetravel: false,
  apy: apy,
  url: 'https://app.takaralend.com',
};
