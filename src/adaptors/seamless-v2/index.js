const sdk = require('@defillama/sdk');
const ethers = require('ethers');
const BigNumber = require('bignumber.js');

const utils = require('../utils');
const lendingAdapterAbi = require('./lending-adapter-abi.json');
const leverageManagerAbi = require('./leverage-manager-abi.json');
const leverageTokenAbi = require('./leverage-token-abi.json');
const erc20Abi = require('./erc20-abi.json');

const SECONDS_PER_DAY = 86400;
const SECONDS_PER_YEAR = 31536000;
const LEVERAGE_TOKEN_DECIMALS = 18;
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

const getLeverageTokens = async (chain, toBlock) => {
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

  const leverageTokens = leverageTokenCreatedEvents.output.map((ev) => iface.parseLog(ev).args).map((ev) => {
    return {
      address: ev.token,
      collateralAsset: ev.collateralAsset,
      debtAsset: ev.debtAsset,
      lendingAdapter: ev.config[0]
    }
  });

  const collateralDecimals = (
    await sdk.api.abi.multiCall({
      chain,
      abi: erc20Abi.find(({ name }) => name === 'decimals'),
      calls: leverageTokens.map(({ collateralAsset }) => ({ target: collateralAsset })),
      permitFailure: true,
    })
  ).output.map(({ output, success }) => success ? output : null);

  const debtDecimals = (
    await sdk.api.abi.multiCall({
      chain,
      abi: erc20Abi.find(({ name }) => name === 'decimals'),
      calls: leverageTokens.map(({ debtAsset }) => ({ target: debtAsset })),
      permitFailure: true,
    })
  ).output.map(({ output, success }) => success ? output : null);

  const symbols = (
    await sdk.api.abi.multiCall({
      chain,
      abi: leverageTokenAbi.find(({ name }) => name === 'symbol'),
      calls: leverageTokens.map(({ address }) => ({ target: address })),
      permitFailure: true,
    })
  ).output.map(({ output, success }) => success ? output : null);

  return leverageTokens.map(({ address, collateralAsset, lendingAdapter }, i) => {
    return {
      address,
      collateralAsset,
      lendingAdapter,
      collateralDecimals: collateralDecimals[i],
      debtDecimals: debtDecimals[i],
      symbol: symbols[i]
    };
  });
};

function formatUnitsToNumber(value, decimals) {
  return Number(ethers.utils.formatUnits(value, decimals));
}

function calculateApy(endValue, startValue, timeWindow, compoundingPeriods, decimals) {
  const endValueNumber = formatUnitsToNumber(endValue, decimals);

  const startValueNumber = formatUnitsToNumber(startValue, decimals);

  const timeWindowNumber = Number(timeWindow);

  const apr =
    (endValueNumber / startValueNumber) **
      (SECONDS_PER_YEAR / timeWindowNumber) -
    1;

  return ((1 + apr / compoundingPeriods) ** compoundingPeriods - 1) * 100;
}

const getLeverageTokenTvlsUsd = async (chain, leverageTokens) => {
  const totalCollaterals = (
    await sdk.api.abi.multiCall({
      chain,
      abi: lendingAdapterAbi.find(({ name }) => name === 'getCollateral'),
      calls: leverageTokens.map(({ lendingAdapter }) => ({ target: lendingAdapter })),
      permitFailure: true,
    })
  ).output.map(({ output, success }) => success ? output : null);

  const { pricesByAddress } = await utils.getPrices(
    leverageTokens.map(({ collateralAsset }) => collateralAsset),
    chain
  );

  return totalCollaterals.map((totalCollateral, i) => {
    const collateralAsset = leverageTokens[i].collateralAsset;

    return (totalCollateral !== null && leverageTokens[i].collateralDecimals !== null && pricesByAddress[collateralAsset.toLowerCase()] !== null)
      ? BigNumber(totalCollateral).multipliedBy(BigNumber(pricesByAddress[collateralAsset.toLowerCase()])).dividedBy(BigNumber(10).pow(leverageTokens[i].collateralDecimals)).toNumber()
      : null;
  });
}

const getLtPricesInDebtAsset = async (chain, blockNumber, leverageTokens) => {
  const equityInDebtAsset = (
    await sdk.api.abi.multiCall({
      chain,
      abi: leverageManagerAbi.find(({ name }) => name === 'getLeverageTokenState'),
      calls: leverageTokens.map(({ address }) => ({ target: LEVERAGE_MANAGER_ADDRESS[chain], params: [address] })),
      block: blockNumber,
      permitFailure: true
    })
  ).output.map(({ output, success }) => success ? output.equity : null);

  const totalSupply = (
    await sdk.api.abi.multiCall({
      chain,
      abi: leverageManagerAbi.find(({ name }) => name === 'getFeeAdjustedTotalSupply'),
      calls: leverageTokens.map(({ address }) => ({ target: LEVERAGE_MANAGER_ADDRESS[chain], params: [address] })),
      block: blockNumber,
      permitFailure: true
    })
  ).output.map(({ output }) => output);

  return equityInDebtAsset.map((equity, i) =>
    equity ? BigInt(equity) * BigInt(10 ** LEVERAGE_TOKEN_DECIMALS) /
    BigInt(totalSupply[i]) : null
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

  const allLeverageTokens = await getLeverageTokens(chain, latestBlock.number);

  const latestBlockPricesInDebtAsset = await getLtPricesInDebtAsset(
    chain,
    latestBlock.number,
    allLeverageTokens
  );

  const prevBlock1DayPricesInDebtAsset = await getLtPricesInDebtAsset(
    chain,
    prevBlock1Day.number,
    allLeverageTokens
  );

  const prevBlock7DayPricesInDebtAsset = await getLtPricesInDebtAsset(
    chain,
    prevBlock7Day.number,
    allLeverageTokens
  );

  const leverageTokenTvlsUsd = await getLeverageTokenTvlsUsd(
    chain,
    allLeverageTokens
  );

  const pools = allLeverageTokens.map(({ address, collateralAsset, debtDecimals, symbol }, i) => {
    const apyBase = calculateApy(
      latestBlockPricesInDebtAsset[i],
      prevBlock1DayPricesInDebtAsset[i],
      latestBlock.timestamp - prevBlock1Day.timestamp,
      COMPOUNDING_PERIODS,
      debtDecimals
    );

    const apyBase7d = calculateApy(
      latestBlockPricesInDebtAsset[i],
      prevBlock7DayPricesInDebtAsset[i],
      latestBlock.timestamp - prevBlock7Day.timestamp,
      COMPOUNDING_PERIODS,
      debtDecimals
    );

    const pool = {
      pool: `${address}-${chain}`.toLowerCase(),
      chain: utils.formatChain(chain),
      project: 'seamless-v2',
      symbol,
      tvlUsd: leverageTokenTvlsUsd[i],
      apyBase,
      apyBase7d,
      underlyingTokens: [collateralAsset],
    };

    return pool;
  });

  return pools;
};

const apy = async () => {
  const results = await Promise.all(
    chains.map((chain) => leverageTokenApys(chain))
  );
  return results.flat().filter((p) => utils.keepFinite(p));
};

module.exports = {
  timetravel: false,
  apy,
  url: 'https://app.seamlessprotocol.com',
};
