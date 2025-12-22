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
const ONE_USD = BigInt(10 ** USD_DECIMALS);
const COMPOUNDING_PERIODS = 1;
const chain = 'ethereum';

const LEVERAGE_MANAGER_ADDRESS = {
  ethereum: '0x5C37EB148D4a261ACD101e2B997A0F163Fb3E351',
};

const API_URLS = {
  ethereum: sdk.graph.modifyEndpoint(
    '2vzaVmMnkzbcfgtP2nqKbVWoqAUumvj24RzHPE1NxPkg'
  ),
};

const leverageTokensQuery = gql`
  {
    leverageTokens {
      id
    }
  }
`

const getAllLeverageTokens = async () => {
    let leverageTokens = (await Promise.allSettled(
      Object.entries(API_URLS).map(async ([chain, url]) => [
        chain,
        (await request(url, leverageTokensQuery)).leverageTokens,
      ])
    )).filter((i) => i.status === 'fulfilled').map((i) => i.value[1]).flat();
    return leverageTokens.map((token) => token.id);
};

const getPrices = async (addresses) => {
  const priceUrl = `https://coins.llama.fi/prices/current/${addresses
        .join(',')
        .toLowerCase()}`;
  const prices = (
    await superagent.get(
      priceUrl
    )
  ).body.coins;

  const pricesBySymbol = Object.entries(prices).reduce(
    (acc, [name, price]) => ({
      ...acc,
      [price.symbol.toLowerCase()]: price.price,
    }),
    {}
  );

  const pricesByAddress = Object.entries(prices).reduce(
    (acc, [name, price]) => ({
      ...acc,
      [name.split(':')[1]]: price.price,
    }),
    {}
  );

  return { pricesByAddress, pricesBySymbol };
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

const getLeverageTokenTvlsUsd = async (leverageTokens, debtAssets) => {
  const equityInDebtAsset = (
    await sdk.api.abi.multiCall({
      chain,
      abi: leverageManagerAbi.find(({ name }) => name === 'getLeverageTokenState'),
      calls: leverageTokens.map((address) => ({ target: LEVERAGE_MANAGER_ADDRESS[chain], params: [address] }))
    })
  ).output.map(({ output }) => output.equity);

  const debtPrices = await getPrices(debtAssets.map((address) => `ethereum:${address.toLowerCase()}`));

  const debtDecimals = (
    await sdk.api.abi.multiCall({
      chain,
      abi: leverageTokenAbi.find(({ name }) => name === 'decimals'),
      calls: debtAssets.map((address) => ({ target: address })),
      permitFailure: true,
    })
  ).output.map(({ output }) => output);

  return debtAssets.map((debtAsset, i) =>
    equityInDebtAsset[i] / 10 ** debtDecimals[i] * debtPrices.pricesByAddress[debtAsset.toLowerCase()]
  );
}

function getDebtPricesBigInt(debtPrices, debtAssets) {
  return debtAssets.map((address) => {
    const price = debtPrices.pricesByAddress[address.toLowerCase()];
    if (!price) {
      throw new Error(`Price not found for debt asset: ${address}`);
    }
    // Format to exactly 8 decimal places (truncates if more, pads if less)
    const priceStr = price.toFixed(USD_DECIMALS);
    return ethers.utils.parseUnits(priceStr, USD_DECIMALS).toBigInt();
  });
}

const getLpPrices = async (blockNumber, leverageTokens, debtAssets) => {
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

  const debtPrices = await getPrices(debtAssets.map((address) => `ethereum:${address.toLowerCase()}`));

  // Convert debtPrices to BigInt with 8 decimals of precision using ethers
  const debtPricesBigInt = getDebtPricesBigInt(debtPrices, debtAssets);

  const debtDecimals = (
    await sdk.api.abi.multiCall({
      chain,
      abi: leverageTokenAbi.find(({ name }) => name === 'decimals'),
      calls: debtAssets.map((address) => ({ target: address })),
      permitFailure: true,
    })
  ).output.map(({ output }) => output);

  const equityUSD = debtAssets.map((debtAsset, i) =>
    BigInt(equityInDebtAsset[i]) * debtPricesBigInt[i]
  );

  return equityUSD.map(
    (tokenEquityUSD, i) =>
      tokenEquityUSD ? BigInt(tokenEquityUSD) * BigInt(10 ** LEVERAGE_TOKEN_DECIMALS) /
      (BigInt(totalSupply[i]) * BigInt(10 ** debtDecimals[i])) : 0
  );
};

const leverageTokenApys = async () => {
  const latestBlock = await sdk.api.util.getLatestBlock(chain);
  const prevBlock1Day = await sdk.api.util.lookupBlock(
    latestBlock.timestamp - SECONDS_PER_DAY,
    { chain }
  );
  const prevBlock7Day = await sdk.api.util.lookupBlock(
    latestBlock.timestamp - 7 * SECONDS_PER_DAY,
    { chain }
  );

  const allLeverageTokens = await getAllLeverageTokens();

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

  const latestBlockPrices = await getLpPrices(
    latestBlock.number,
    allLeverageTokens,
    debtAssets,
  );

  const prevBlock1DayPrices = await getLpPrices(
    prevBlock1Day.number,
    allLeverageTokens,
    debtAssets,
  );

  const prevBlock7DayPrices = await getLpPrices(
    prevBlock7Day.number,
    allLeverageTokens,
    debtAssets,
  );

  const leverageTokenTvlsUsd = await getLeverageTokenTvlsUsd(
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
  const apys = await Promise.all([leverageTokenApys()]);

  return apys.flat().filter((p) => utils.keepFinite(p));
};

module.exports = {
  timetravel: false,
  apy,
  url: 'https://app.seamlessprotocol.com',
};
