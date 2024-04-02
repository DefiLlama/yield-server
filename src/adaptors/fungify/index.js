const utils = require('../utils');
const sdk = require("@defillama/sdk");
const ABI = require("./abi.json")

// Mainnet Contract Addresses
const COMPTROLLER = "0xf9c70750bF615dE83fE7FF62D30C7faACD8f8Ba0";
const LENS = "0x2C4A503Bce0805C357D961e45b55BEEE073188E7";
const PRICE_ORACLE = "0x9b960808875000AC17dfAE13B72BBDF69DF6e7A7";

console.log(ABI['getAllMarkets'])

getAllMarkets().then(console.log)

async function getAllMarkets() {

  // Fetch all Markets from comptroller
  const cTokenMarkets = (await sdk.api.abi.call({
    target: COMPTROLLER,
    params: [],
    abi: ABI['getAllMarkets'],
    chain: 'ethereum'
  })).output;

  return cTokenMarkets
}

async function getDecimalForUnderlyingAsset(underlyingAsset) {
const cTokenMetadatas = (await sdk.api.abi.call({
  target: underlyingAsset,
  params: [],
  abi: ABI['decimals'],
  chain: 'ethereum'
})).output;

return cTokenMetadatas
}


async function getUnderlyingPrice(cTokenAddress) {
const cTokenMetadatas = (await sdk.api.abi.call({
  target: PRICE_ORACLE,
  params: [cTokenAddress],
  abi: ABI['getUnderlyingPrice'],
  chain: 'ethereum'
})).output;

return cTokenMetadatas
}

async function getCtokenMetadata(markets) {

  // Fetch metdata for all markets
  const cTokenMetadatas = (await sdk.api.abi.call({
    target: LENS,
    params: [markets],
    abi: ABI['cTokenMetadataAll5'],
    chain: 'ethereum'
  })).output;

  return cTokenMetadatas
}

async function getErc20balance(tokenAddress, cTokenAddress) {
const underlyingBalance = (await sdk.api.abi.call({
  target: tokenAddress,
  params: [cTokenAddress],
  abi: ABI["balanceOf"],
  chain: 'ethereum'
})).output;
return underlyingBalance
}

// // Copied Template
// const poolsFunction = async () => {
//   const apyData = await utils.getData(
//     'https://api.anchorprotocol.com/api/v1/market/ust'
//   );
//   const dataTvl = await utils.getData(
//     'https://api.anchorprotocol.com/api/v1/deposit'
//   );

//   const ustPool = {
//     pool: 'terra1hzh9vpxhsk8253se0vv5jj6etdvxu3nv8z07zu',
//     chain: utils.formatChain('terra'),
//     project: 'anchor',
//     symbol: utils.formatSymbol('UST'),
//     tvlUsd: Number(dataTvl.total_ust_deposits) / 1e6,
//     apy: apyData.deposit_apy * 100,
//   };

//   return [ustPool]; // Anchor only has a single pool with APY
// };

// module.exports = {
//   timetravel: false,
//   apy: poolsFunction,
//   url: 'https://app.anchorprotocol.com/#/earn',
// };