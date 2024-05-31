const utils = require('../utils');
const sdk = require('@defillama/sdk');
const ABI = require('./abi.json');

const CHAIN = 'ethereum';
const COMPTROLLER = '0xf9c70750bF615dE83fE7FF62D30C7faACD8f8Ba0';
const LENS = '0x2C4A503Bce0805C357D961e45b55BEEE073188E7';
const PRICE_ORACLE = '0x9b960808875000AC17dfAE13B72BBDF69DF6e7A7';
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';
const SCALE = 1e18;

// Fetch all Markets from comptroller
async function getAllMarkets() {
  const cTokenMarkets = (
    await sdk.api.abi.call({
      target: COMPTROLLER,
      params: [],
      abi: ABI['getAllMarkets'],
      chain: CHAIN,
    })
  ).output;
  return cTokenMarkets;
}

// Fetch metdata for all markets
async function getCtokenMetadata(markets) {
  const cTokenMetadatas = (
    await sdk.api.abi.call({
      target: LENS,
      params: [markets],
      abi: ABI['cTokenMetadataAll'],
      chain: CHAIN,
    })
  ).output;
  return cTokenMetadatas;
}

// Fetches balance of an asset for a given address
async function getBalance(assetAddress, subjectAddress) {
  const underlyingBalance = (
    await sdk.api.abi.call({
      target: assetAddress,
      params: [subjectAddress],
      abi: ABI['balanceOf'],
      chain: CHAIN,
    })
  ).output;
  return underlyingBalance;
}

// Fetches the cash of a cToken
async function getTotalCash(cTokenAddress) {
  const totalCash = (
    await sdk.api.abi.call({
      target: cTokenAddress,
      params: [],
      abi: ABI['getCash'],
      chain: CHAIN,
    })
  ).output;
  return totalCash;
}

// Fetches the total reserves of a cToken
async function getTotalReserves(cTokenAddress) {
  const totalReserves = (
    await sdk.api.abi.call({
      target: cTokenAddress,
      params: [],
      abi: ABI['totalReserves'],
      chain: CHAIN,
    })
  ).output;
  return totalReserves;
}

// Fetches the total borrows of a cToken
async function getTotalBorrows(cTokenAddress) {
  const totalBorrows = (
    await sdk.api.abi.call({
      target: cTokenAddress,
      params: [],
      abi: ABI['totalBorrows'],
      chain: CHAIN,
    })
  ).output;
  return totalBorrows;
}

// Fetches the cToken to underlying exchange rate of the asset
async function getExchangeRate(cTokenAddress) {
  const exchangeRate = (
    await sdk.api.abi.call({
      target: cTokenAddress,
      params: [],
      abi: ABI['exchangeRateStored'],
      chain: CHAIN,
    })
  ).output;
  return exchangeRate;
}

// Gets the underlying asset of a cToken
async function getUnderlyingAsset(cTokenAddress) {
  const underlyingAddress = (
    await sdk.api.abi.call({
      target: cTokenAddress,
      params: [],
      abi: ABI['underlying'],
      chain: CHAIN,
    })
  ).output;
  return underlyingAddress;
}

// Gets the symbol of the market token
async function getSymbol(cTokenAddress) {
  const symbol = (
    await sdk.api.abi.call({
      target: cTokenAddress,
      params: [],
      abi: ABI['symbol'],
      chain: CHAIN,
    })
  ).output;
  return symbol;
}

// Gets the interestMarket for cErc721s
async function getInterestMarket() {
  const interestMarket = (
    await sdk.api.abi.call({
      target: COMPTROLLER,
      params: [],
      abi: ABI['interestMarket'],
      chain: CHAIN,
    })
  ).output;
  return interestMarket;
}

// Gets the interestRateModel (used for blocksPerYear)
async function getInterestRateModel(cTokenAddress) {
  const interestRateModel = (
    await sdk.api.abi.call({
      target: cTokenAddress,
      params: [],
      abi: ABI['interestRateModel'],
      chain: CHAIN,
    })
  ).output;
  return interestRateModel;
}

// Gets the blockPerYear for apys
async function getBlocksPerYear(interestRateModel) {
  const blocksPerYear = (
    await sdk.api.abi.call({
      target: interestRateModel,
      params: [],
      abi: ABI['blocksPerYear'],
      chain: CHAIN,
    })
  ).output;
  return blocksPerYear;
}

async function getUnderlyingPrice(cTokenAddress) {
  const underlyingPrice = (
    await sdk.api.abi.call({
      target: PRICE_ORACLE,
      params: [cTokenAddress],
      abi: ABI['getUnderlyingPrice'],
      chain: CHAIN,
    })
  ).output;
  return underlyingPrice;
}

// Creates a pool dictionary of the proper format
async function poolStruct(
  poolIdentifier,
  chain,
  symbol,
  tvlUsd,
  totalBorrowsUsd,
  totalSuppliesUsd,
  apy,
  underlyingTokens,
  apyBorrow,
  ltv
) {
  return {
    pool: poolIdentifier, // unique identifier for the pool in the form of: `${ReceivedTokenAddress}-${chain}`.toLowerCase()
    chain: chain, // chain where the pool is (needs to match the `name` field in here https://api.llama.fi/chains)
    project: 'fungify', // protocol (using the slug again)
    symbol: symbol, // symbol of the tokens in pool, can be a single symbol if pool is single-sided or multiple symbols (eg: USDT-ETH) if it's an LP
    tvlUsd: tvlUsd, // number representing current USD free liquidity in pool
    totalBorrowUsd: totalBorrowsUsd, // number representing current USD borrows in pool
    totalSupplyUsd: totalSuppliesUsd, // number representing current USD supplies in pool
    apyBase: apy, // APY from pool fees/supplying in %
    underlyingTokens: underlyingTokens, // Array of underlying token addresses from a pool, eg here USDT address on ethereum // Array<string>;
    url: 'https://app.fungify.it/pools', // URL for app
    apyBaseBorrow: apyBorrow, // Borrow APR
    ltv: ltv, // Collateral Factor
  };
}

// Fetches the apy for all markets
async function poolsAPY() {
  const markets = await getAllMarkets();
  const cTokenMetadatas = await getCtokenMetadata(markets);
  const interestMarket = await getInterestMarket();
  const interestToken = await getUnderlyingAsset(interestMarket);
  let pools = [];

  // Iterates through each market's metadata calculating the APY
  for (const cTokenMetaData of cTokenMetadatas) {
    const cTokenAddress = cTokenMetaData.cToken;
    const symbol = await getSymbol(cTokenAddress);
    if (symbol.includes('_NB')) continue; // Excludes no borrow markets since they will always have 0% APY

    let underlyingAsset = cTokenMetaData.underlyingAssetAddress;
    const marketType = cTokenMetaData.marketType;

    const interestRateModel = await getInterestRateModel(cTokenAddress);
    const supplyRatePerBlock = cTokenMetaData.supplyRatePerBlock;
    const borrowRatePerBlock = cTokenMetaData.borrowRatePerBlock;
    const blocksPerYear = await getBlocksPerYear(interestRateModel);
    const apy = ((supplyRatePerBlock * blocksPerYear) / SCALE) * 100;
    const apyBorrow = ((borrowRatePerBlock * blocksPerYear) / SCALE) * 100;

    const ltv = cTokenMetaData.collateralFactorMantissa / SCALE;
    const underlyingPrice = await getUnderlyingPrice(cTokenAddress);
    const poolIdentifier = `${cTokenAddress}-${CHAIN}`.toLowerCase();

    const totalCash = Number(await getTotalCash(cTokenAddress));
    const totalBorrows = Number(await getTotalBorrows(cTokenAddress));
    const totalReserves = Number(await getTotalReserves(cTokenAddress));

    const tvlUsd =
      ((totalCash - totalReserves) * underlyingPrice) / SCALE / SCALE;
    const totalBorrowsUsd = (totalBorrows * underlyingPrice) / SCALE / SCALE;
    const totalSuppliesUsd =
      ((totalCash + totalBorrows - totalReserves) * underlyingPrice) /
      SCALE /
      SCALE;

    let poolInfo = await poolStruct(
      poolIdentifier,
      CHAIN,
      symbol,
      tvlUsd,
      totalBorrowsUsd,
      totalSuppliesUsd,
      apy,
      [underlyingAsset],
      apyBorrow,
      ltv
    );
    pools.push(poolInfo);
  }
  return pools;
}

module.exports = {
  timetravel: false,
  apy: poolsAPY,
  url: 'https://app.fungify.it/pools',
};
