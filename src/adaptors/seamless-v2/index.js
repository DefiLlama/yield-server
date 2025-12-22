const sdk = require('@defillama/sdk');
const ethers = require('ethers');
const superagent = require('superagent');
const { request, gql } = require('graphql-request');

const utils = require('../utils');
const leverageManagerAbi = require('./leverage-manager-abi.json');
const leverageTokenAbi = require('./leverage-token-abi.json');

const SECONDS_PER_YEAR = 31536000;
const SECONDS_PER_DAY = 86400;
const LEVERAGE_TOKEN_DECIMALS = 18;
const USD_DECIMALS = 8;
const COMPOUNDING_PERIODS = 1;
const chains = ['ethereum', 'base'];

const LEVERAGE_MANAGER_ADDRESS = {
  ethereum: '0x5C37EB148D4a261ACD101e2B997A0F163Fb3E351',
  base: '0x38Ba21C6Bf31dF1b1798FCEd07B4e9b07C5ec3a8'
};

const LEVERAGE_MANAGER_DEPLOYMENT_BLOCK = {
  ethereum: 23471226,
  base: 31051780
};

const getAllLeverageTokens = async (chain, toBlock) => {
  const iface = new ethers.utils.Interface([
    'event LeverageTokenCreated(address indexed token, address collateralAsset, address debtAsset, (address lendingAdapter, address rebalanceAdapter, uint256 mintTokenFee, uint256 redeemTokenFee) config)',
  ]);
  const leverageTokenCreatedEvents = (
    await sdk.api2.util.getLogs({
      chain,
      target: LEVERAGE_MANAGER_ADDRESS[chain],
      topics: ["0xc3f4681fb2a57a13e121c6f24fe319c8572bb001497f2b74712695625ee9028e"],
      fromBlock: LEVERAGE_MANAGER_DEPLOYMENT_BLOCK[chain],
      keys: [],
      toBlock,
    })
  );

  return leverageTokenCreatedEvents.output.filter((ev) => !ev.removed).map((ev) => iface.parseLog(ev).args).map((ev) => ev.token);
};

function formatUnitsToNumber(value, decimals) {
  return Number(ethers.utils.formatUnits(value, decimals));
}

function calculateApy(endValue, startValue, timeWindow, compoundingPeriods) {
  const endValueNumber = formatUnitsToNumber(endValue, USD_DECIMALS);

  const startValueNumber = formatUnitsToNumber(startValue, USD_DECIMALS);

  const timeWindowNumber = Number(timeWindow);

  const apr =
    (endValueNumber / startValueNumber) **
      (SECONDS_PER_YEAR / timeWindowNumber) -
    1;

  return ((1 + apr / compoundingPeriods) ** compoundingPeriods - 1) * 100;
}

const getLeverageTokenTvlsUsd = async (chain, leverageTokens, debtAssets) => {
  const collateralInDebtAsset = (
    await sdk.api.abi.multiCall({
      chain,
      abi: leverageManagerAbi.find(({ name }) => name === 'getLeverageTokenState'),
      calls: leverageTokens.map((address) => ({ target: LEVERAGE_MANAGER_ADDRESS[chain], params: [address] })),
      permitFailure: true
    })
  ).output.map(({ output, success }) => success ? output.collateralInDebtAsset : 0);

  const { pricesByAddress } = await utils.getPrices(
    debtAssets,
    chain
  );

  const debtDecimals = (
    await sdk.api.abi.multiCall({
      chain,
      abi: leverageTokenAbi.find(({ name }) => name === 'decimals'),
      calls: debtAssets.map((address) => ({ target: address })),
      permitFailure: true,
    })
  ).output.map(({ output }) => output);

  return debtAssets.map((debtAsset, i) =>
    collateralInDebtAsset[i] / 10 ** debtDecimals[i] * pricesByAddress[debtAsset.toLowerCase()]
  );
}

const getLpPricesInDebtAsset = async (chain, blockNumber, leverageTokens, debtAssets) => {
  const equityInDebtAsset = (
    await sdk.api.abi.multiCall({
      chain,
      abi: leverageManagerAbi.find(({ name }) => name === 'getLeverageTokenState'),
      calls: leverageTokens.map((address) => ({ target: LEVERAGE_MANAGER_ADDRESS[chain], params: [address] })),
      block: blockNumber,
      permitFailure: true
    })
  ).output.map(({ output, success }) => success ? output.equity : 0);

  const totalSupply = (
    await sdk.api.abi.multiCall({
      chain,
      abi: leverageManagerAbi.find(({ name }) => name === 'getFeeAdjustedTotalSupply'),
      calls: leverageTokens.map((address) => ({ target: LEVERAGE_MANAGER_ADDRESS[chain], params: [address] })),
      block: blockNumber,
      permitFailure: true
    })
  ).output.map(({ output }) => output);

  return equityInDebtAsset.map((equity, i) =>
    equityInDebtAsset ? BigInt(equity) * BigInt(10 ** LEVERAGE_TOKEN_DECIMALS) /
    BigInt(totalSupply[i]) : 0
  );
};

const leverageTokenApys = async (chain) => {
  const latestBlock = await sdk.api.util.getLatestBlock(chain);
  const prevBlock1Day = await sdk.api.util.lookupBlock(
    latestBlock.timestamp - SECONDS_PER_DAY,
    { chain }
  );
  const prevBlock7Day = await sdk.api.util.lookupBlock(
    latestBlock.timestamp - 7 * SECONDS_PER_DAY,
    { chain }
  );

  const allLeverageTokens = await getAllLeverageTokens(chain, latestBlock.number);

  const collateralAssets = (
    await sdk.api.abi.multiCall({
      chain,
      abi: leverageManagerAbi.find(({ name }) => name === 'getLeverageTokenCollateralAsset'),
      calls: allLeverageTokens.map((address) => ({ target: LEVERAGE_MANAGER_ADDRESS[chain], params: [address] })),
      permitFailure: true,
    })
  ).output.map(({ output }) => output);

  const debtAssets = (
    await sdk.api.abi.multiCall({
      chain,
      abi: leverageManagerAbi.find(({ name }) => name === 'getLeverageTokenDebtAsset'),
      calls: allLeverageTokens.map((address) => ({ target: LEVERAGE_MANAGER_ADDRESS[chain], params: [address] })),
      permitFailure: true,
    })
  ).output.map(({ output }) => output);

  const symbols = (
    await sdk.api.abi.multiCall({
      chain,
      abi: leverageTokenAbi.find(({ name }) => name === 'symbol'),
      calls: allLeverageTokens.map((address) => ({ target: address })),
      permitFailure: true,
    })
  ).output.map(({ output }) => output);

  const latestBlockPrices = await getLpPricesInDebtAsset(
    chain,
    latestBlock.number,
    allLeverageTokens,
    debtAssets,
  );

  const prevBlock1DayPrices = await getLpPricesInDebtAsset(
    chain,
    prevBlock1Day.number,
    allLeverageTokens,
    debtAssets,
  );

  const prevBlock7DayPrices = await getLpPricesInDebtAsset(
    chain,
    prevBlock7Day.number,
    allLeverageTokens,
    debtAssets,
  );

  const leverageTokenTvlsUsd = await getLeverageTokenTvlsUsd(
    chain,
    allLeverageTokens,
    debtAssets
  );

  const pools = allLeverageTokens.map((address, i) => {
    const apyBase = calculateApy(
      latestBlockPrices[i],
      prevBlock1DayPrices[i],
      latestBlock.timestamp - prevBlock1Day.timestamp,
      COMPOUNDING_PERIODS
    );

    const apyBase7d = calculateApy(
      latestBlockPrices[i],
      prevBlock7DayPrices[i],
      latestBlock.timestamp - prevBlock7Day.timestamp,
      COMPOUNDING_PERIODS
    );

    const pool = {
      pool: `${address}-${chain}`.toLowerCase(),
      chain: utils.formatChain(chain),
      project: 'seamless-v2',
      symbol: symbols[i],
      tvlUsd: leverageTokenTvlsUsd[i],
      apyBase,
      apyBase7d,
      underlyingTokens: [collateralAssets[i]],
    };

    return pool;
  });

  return pools;
};

const apy = async () => {
  const response = [];
  for (const chain of chains) {
    const apys = await Promise.all([leverageTokenApys(chain)]);
    response.push(...apys.flat().filter((p) => utils.keepFinite(p)));
  }

  return response;
};

module.exports = {
  timetravel: false,
  apy,
  url: 'https://app.seamlessprotocol.com',
};
