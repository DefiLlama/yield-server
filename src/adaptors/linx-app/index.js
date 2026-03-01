const utils = require('../utils');
const axios = require('axios');
const bs58 = require("bs58");

const WAD = 10n ** 18n;

const MARKET_CREATED_EVENT_INDEX = 4;
const MARKET_METHOD_INDEX = 4;
const MARKET_PARAMS_METHOD_INDEX = 5;

const config = {
  linxContractId: "vQcfta4Mm32L7Xsb7tYF2rrR76JWxjNv3oia8GPK6x71",
  dynamicIrmContractId: "0fd591cc3916b7538b587e79cfc1e305dfb4fff183eda288ce5494489ffcc400",
  group: 0,
  nodeApiHost: "https://node.mainnet.alephium.org",
  chain: 'alephium',
}

const tokensMapping = {
  // alephium:USDT - ethereum:USDT
  "556d9582463fe44fbd108aedc9f409f69086dc78d994b88ea6c9e65f8bf98e00": "0xdac17f958d2ee523a2206206994597c13d831ec7",
  // alephium:USDC - ethereum:USDC
  "722954d9067c5a5ad532746a024f2a9d7a18ed9b90e27d0a3a504962160b5600": "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
}

/********** Alephium Helpers **********/

async function contractMultiCall(payload) {
  try {
    const result = (
      await axios.post(`${config.nodeApiHost}/contracts/multicall-contract`, {
        calls: payload,
      })
    ).data;
    return result.results.map((r) => tryGetCallResult(r));
  } catch (error) {
    console.error("Error in contractMultiCall:", error);
    throw error;
  }
}

function tryGetCallResult(result) {
  if (result.type === "CallContractFailed") {
    throw new Error(`Failed to call contract, error: ${result.error}`);
  }
  return result;
}

function hexToBinUnsafe(hex) {
  const bytes = [];
  for (let i = 0; i < hex.length; i += 2) {
    bytes.push(parseInt(hex.slice(i, i + 2), 16));
  }
  return new Uint8Array(bytes);
}

function addressFromContractId(contractId) {
  const hash = hexToBinUnsafe(contractId);
  const bytes = new Uint8Array([0x03, ...hash]);
  return bs58.encode(bytes);
}

async function getTokens() {
  const response = await axios.get(`https://raw.githubusercontent.com/alephium/token-list/refs/heads/master/tokens/mainnet.json`)

  return response.data.tokens.reduce((map, token) => {
    map[token.id] = token
    return map;
  }, {});
}

/********** Linx App Helpers **********/

function mulDivDown(x, y, d) {
  return (x * y) / d;
}

function wMulDown(x, y) {
  return mulDivDown(x, y, WAD);
}

function wTaylorCompounded(x, n) {
  let firstTerm = x * n;
  let secondTerm = mulDivDown(firstTerm, firstTerm, 2n * WAD);
  let thirdTerm = mulDivDown(secondTerm, firstTerm, 3n * WAD);

  return firstTerm + secondTerm + thirdTerm;
}

async function getEvents(contractAddress) {
  let events = [];
  let start = 0;
  const limit = 100;

  while (true) {
    const response = await axios.get(`${config.nodeApiHost}/events/contract/${contractAddress}?start=${start}&limit=${limit}`);
    events = events.concat(response.data.events);
    if (!response.data.events.length || response.data.nextStart === undefined) break;
    start = response.data.nextStart;
  }
  return events;
}

async function getMarkets() {
  const response = await axios.get(`https://api.linxlabs.org/lending/v1/markets`);
  return response.data;
}

async function getMarketState(marketId) {
  const state = await contractMultiCall([{
    group: config.group,
    address: config.linxContractId,
    methodIndex: MARKET_METHOD_INDEX,
    args: [{ type: "ByteVec", value: marketId }]
  }]);

  return {
    totalSupplyAssets: state[0].returns[0].value,
    totalSupplyShares: state[0].returns[1].value,
    totalBorrowAssets: state[0].returns[2].value,
    totalBorrowShares: state[0].returns[3].value,
    lastUpdate: state[0].returns[4].value,
    fee: state[0].returns[5].value,
  }
}

async function getMarketParams(marketId) {
  const params = await contractMultiCall([{
    group: config.group,
    address: config.linxContractId,
    methodIndex: MARKET_PARAMS_METHOD_INDEX,
    args: [{ type: "ByteVec", value: marketId }]
  }]);

  return {
    loanToken: params[0].returns[0].value,
    collateralToken: params[0].returns[1].value,
    oracle: params[0].returns[2].value,
    interestRateModel: params[0].returns[3].value,
    loanToValue: params[0].returns[4].value,
  }
}

async function getBorrowRate(irmId, marketParams, marketState) {
  const contractAddress = addressFromContractId(irmId);
  const result = await contractMultiCall([{
    group: config.group,
    address: contractAddress,
    methodIndex: 2,
    args: [
      { type: "ByteVec", value: marketParams.loanToken },
      { type: "ByteVec", value: marketParams.collateralToken },
      { type: "ByteVec", value: marketParams.oracle },
      { type: "ByteVec", value: marketParams.interestRateModel },
      { type: "U256", value: marketParams.loanToValue },
      { type: "U256", value: marketState.totalSupplyAssets },
      { type: "U256", value: marketState.totalSupplyShares },
      { type: "U256", value: marketState.totalBorrowAssets },
      { type: "U256", value: marketState.totalBorrowShares },
      { type: "U256", value: marketState.lastUpdate },
      { type: "U256", value: marketState.fee },
    ]
  }]);

  return BigInt(result[0].returns[0].value);
}

function getBorrowAPY(irPerSecond) {
  return wTaylorCompounded(irPerSecond, 3600n * 24n * 365n);
}

function getSupplyAPY(irPerSecond, marketState) {
  let borrowApy = getBorrowAPY(irPerSecond);
  return BigInt(marketState.totalSupplyAssets) > 0n
    ? wMulDown(
        1n * 10n ** 18n - BigInt(marketState.fee),
        (borrowApy * BigInt(marketState.totalBorrowAssets)) / BigInt(marketState.totalSupplyAssets),
      )
    : 0n;
}

/********** Main APY Function **********/

const apy = async () => {
  const tokens = await getTokens();
  const markets = await getMarkets();
  const prices = await utils.getPrices(Object.values(tokensMapping), 'ethereum');
  let pools = [];

  for (const market of markets) {
    const marketState = await getMarketState(market.id);
    const marketParams = await getMarketParams(market.id);

    if (marketParams.interestRateModel !== config.dynamicIrmContractId) {
      console.warn(`Skipping market ${market.id} with unsupported IRM ${marketParams.interestRateModel}`);
      continue;
    }

    const supplyToken = tokens[marketParams.loanToken];
    const collateralToken = tokens[marketParams.collateralToken];
    if (!supplyToken || !collateralToken) {
      console.warn(`Skipping market ${market.id} due to missing token data`);
      continue;
    }

    const supplyTokenSymbol = supplyToken.symbolOnChain || supplyToken.symbol;
    const collateralTokenSymbol = collateralToken.symbolOnChain || collateralToken.symbol;

    const symbol = `${supplyTokenSymbol}-${collateralTokenSymbol}`;
    const borrowRate = await getBorrowRate(config.dynamicIrmContractId, marketParams, marketState);
    const supplyApy = getSupplyAPY(borrowRate, marketState);

    const mappedAddress = tokensMapping[marketParams.loanToken];
    if (!mappedAddress) {
      console.warn(`Skipping market ${market.id} due to missing price mapping for token ${marketParams.loanToken}`);
      continue;
    }

    const supplyTokenPrice = prices.pricesByAddress[mappedAddress.toLowerCase()] || 0;

    const totalSupply = Number(BigInt(marketState.totalSupplyAssets) * 10000n / (10n ** BigInt(supplyToken.decimals))) / 10000;
    const totalSupplyUsd = totalSupply * supplyTokenPrice;

    const totalBorrow = Number(BigInt(marketState.totalBorrowAssets) * 10000n / (10n ** BigInt(supplyToken.decimals))) / 10000;
    const totalBorrowUsd = totalBorrow * supplyTokenPrice;

    const tvlUsd = totalSupplyUsd - totalBorrowUsd;

    const pool = {
      pool: `${market.id}-${config.chain}`,
      chain: utils.formatChain(config.chain),
      project: 'linx-app',
      symbol: utils.formatSymbol(symbol),
      tvlUsd,
      apyBase: Number(supplyApy) / 10 ** 16,
      apyBaseBorrow: Number(getBorrowAPY(borrowRate)) / 10 ** 16,
      totalSupplyUsd,
      totalBorrowUsd,
      ltv: Number(marketParams.loanToValue) / 10 ** 18,
      url: `https://app.linxlabs.org/earn/${market.id}-${collateralTokenSymbol}`,
    };
    pools.push(pool);
  }

  return pools;
};

module.exports = {
  timetravel: false,
  apy,
  url: 'https://app.linxlabs.org/earn',
};