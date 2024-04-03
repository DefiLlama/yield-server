const utils = require('../utils');
const sdk = require("@defillama/sdk");
const ABI = require("./abi.json");

const CHAIN = "ethereum";
const COMPTROLLER = "0xf9c70750bF615dE83fE7FF62D30C7faACD8f8Ba0";
const LENS = "0x2C4A503Bce0805C357D961e45b55BEEE073188E7";
const PRICE_ORACLE = "0x9b960808875000AC17dfAE13B72BBDF69DF6e7A7";
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const SCALE = 1e18

// Fetch all Markets from comptroller
async function getAllMarkets() {
  const cTokenMarkets = (await sdk.api.abi.call({
    target: COMPTROLLER,
    params: [],
    abi: ABI['getAllMarkets'],
    chain: CHAIN
  })).output;
  return cTokenMarkets
}

// Fetch metdata for all markets
async function getCtokenMetadata(markets) {
  const cTokenMetadatas = (await sdk.api.abi.call({
    target: LENS,
    params: [markets],
    abi: ABI['cTokenMetadataAll'],
    chain: CHAIN
  })).output;
  return cTokenMetadatas
}

// Fetches balance of an asset for a given address
async function getBalance(assetAddress, subjectAddress) {
  const underlyingBalance = (await sdk.api.abi.call({
    target: assetAddress,
    params: [subjectAddress],
    abi: ABI["balanceOf"],
    chain: CHAIN
  })).output;
  return underlyingBalance
}

// Gets the symbol of the market token
async function getSymbol(cTokenAddress) {
  const symbol = (await sdk.api.abi.call({
    target: cTokenAddress,
    params: [],
    abi: ABI["symbol"],
    chain: CHAIN
  })).output;
  return symbol
}

// Gets the interestMarket for cErc721s
async function getInterestMarket() {
  const interestMarket = (await sdk.api.abi.call({
    target: COMPTROLLER,
    params: [],
    abi: ABI["interestMarket"],
    chain: CHAIN
  })).output;
  return interestMarket
}

// Gets the interestRateModel (used for blocksPerYear)
async function getInterestRateModel(cTokenAddress) {
  const interestRateModel = (await sdk.api.abi.call({
    target: cTokenAddress,
    params: [],
    abi: ABI["interestRateModel"],
    chain: CHAIN
  })).output;
  return interestRateModel
}

// Gets the blockPerYear for apys
async function getBlocksPerYear(interestRateModel) {
  const blocksPerYear = (await sdk.api.abi.call({
    target: interestRateModel,
    params: [],
    abi: ABI["blocksPerYear"],
    chain: CHAIN
  })).output;
  return blocksPerYear
}

async function getUnderlyingPrice(cTokenAddress) {
  const underlyingPrice = (await sdk.api.abi.call({
    target: PRICE_ORACLE,
    params: [cTokenAddress],
    abi: ABI['getUnderlyingPrice'],
    chain: CHAIN
  })).output;
  return underlyingPrice
}

// Creates a pool dictionary of the proper format
async function poolStruct(poolIdentifier, chain, symbol, tvl, apy, rewardTokens, underlyingTokens, ltv) {
  return {
    pool: poolIdentifier, // unique identifier for the pool in the form of: `${ReceivedTokenAddress}-${chain}`.toLowerCase()
    chain: chain, // chain where the pool is (needs to match the `name` field in here https://api.llama.fi/chains)
    project: "fungify", // protocol (using the slug again)
    symbol: symbol, // symbol of the tokens in pool, can be a single symbol if pool is single-sided or multiple symbols (eg: USDT-ETH) if it's an LP
    tvlUsd: tvl, // number representing current USD market size in pool
    apyBase: apy, // APY from pool fees/supplying in %
    rewardTokens: rewardTokens, /// Array of reward token addresses (you can omit this field if a pool doesn't have rewards) // Array<string>;
    underlyingTokens: underlyingTokens, // Array of underlying token addresses from a pool, eg here USDT address on ethereum // Array<string>;
    url: "https://app.fungify.it/pools", // URL for app
    ltv: ltv // Collateral Factor
  }
}

// Fetches the apy for all markets
async function poolsAPY() {

  const provider = sdk.getProvider(CHAIN);
  const markets = await getAllMarkets();
  const cTokenMetadatas = await getCtokenMetadata(markets);
  const interestMarket = await getInterestMarket();
  let pools = [];

  // Iterates through each market's metadata calculating the APY
  for(const cTokenMetaData of cTokenMetadatas) {

    const cTokenAddress = cTokenMetaData.cToken;
    const underlyingAsset = cTokenMetaData.underlyingAssetAddress;
    const marketType = cTokenMetaData.marketType;
    const ltv = cTokenMetaData.collateralFactorMantissa / SCALE;

    const supplyRatePerBlock = cTokenMetaData.supplyRatePerBlock;
    const interestRateModel = await getInterestRateModel(cTokenAddress);
    const blocksPerYear = await getBlocksPerYear(interestRateModel);
    const underlyingPrice = await getUnderlyingPrice(cTokenAddress)
    
    let poolIdentifier = `${cTokenAddress}-${CHAIN}`.toLowerCase();
    let symbol = await getSymbol(cTokenAddress);
    let apy = supplyRatePerBlock * blocksPerYear / SCALE;

    let tvl = 0;
    let underlyingBalance = 0;
    let rewardTokens = [];

    // Erc20 Market and Erc20InterestMarket
    if (marketType == 1 || marketType == 3) {
      if (underlyingAsset == ZERO_ADDRESS) { // Native Token
        underlyingBalance = await provider.getBalance(cTokenAddress);
      } else {
        underlyingBalance = await getBalance(underlyingAsset, cTokenAddress);
      }
      tvl = underlyingBalance * underlyingPrice / SCALE / SCALE
      rewardTokens = [underlyingAsset];

    // Erc721 Market
    } else if (marketType == 2) {
      underlyingBalance = await getBalance(underlyingAsset, cTokenAddress);
      tvl = underlyingBalance * underlyingPrice / SCALE
      rewardTokens = [interestMarket];
    }

    console.log(symbol, "APY:", apy, "LTV:", ltv, "TVL:", tvl)
    // console.log("UnderlyingPrice", underlyingPrice, "UnderlyingBalance:", underlyingBalance)
    
    let poolInfo = await poolStruct(poolIdentifier, CHAIN, symbol, tvl, apy, rewardTokens, [underlyingAsset], ltv);
    pools.push(poolInfo);
  }
  console.log("# Pools:", pools.length)
  // console.log(pools)
  return pools;
}
poolsAPY()

module.exports = {
  timetravel: false,
  apy: poolsAPY,
  url: 'https://app.fungify.it/pools',
};