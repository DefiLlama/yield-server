const axios = require('axios');
const sdk = require('@defillama/sdk');
const utils = require('../utils');
const abiBUSD0 = require('./abiBUSD0');
const abiLendingMarket = require('./abiLendingMarket');

const CHAIN = 'ethereum';
const PROJECT = 'fira';
const URL = 'https://app.fira.money';
const SECONDS_PER_YEAR = 365 * 24 * 60 * 60;
const API_ALIASES = {
  'USD0++': 'bUSD0',
};

const EVENTS = {
  CreateMarket:
    'event CreateMarket(bytes32 indexed id, tuple(address loanToken,address collateralToken,address oracle,address irm,uint256 ltv,uint256 lltv,address whitelist) marketParams)',
};

const BOND_TOKEN_ABI = {
  expiry: 'function expiry() view returns (uint256)',
  fw: 'function FW() view returns (address)',
};

const IIIRM_BORROW_RATE_VIEW_ABI =
  'function borrowRateView((address loanToken,address collateralToken,address oracle,address irm,uint256 ltv,uint256 lltv,address whitelist) marketParams,(uint128 totalSupplyAssets,uint128 totalSupplyShares,uint128 totalBorrowAssets,uint128 totalBorrowShares,uint128 lastUpdate,uint128 fee) market) view returns (uint256)';

const CONFIG = {
  ethereum: {
    USD0PP: '0x35D8949372D46B7a3D5A56006AE77B215fc69bC0',
    USD0: '0x73A15FeD60Bf67631dC6cd7Bc5B6e8da8190aCF5',
    UZRLendingMarket: '0xa428723eE8ffD87088C36121d72100B43F11fb6A',
    UZRLendingMarketId:
      '0xA597B5A36F6CC0EDE718BA58B2E23F5C747DA810BF8E299022D88123AB03340E',
    LTV: 0.88,
  },
  fromBlock: 21900000,
  lendingMarkets: [
    {
      address: '0xc8Db629192a96D6840e88a8451F17655880A2e4D',
      rateType: 'variable',
    },
    {
      address: '0x280ddD897F39C33fEf1CbF863B386Cb9a8e53a0e',
      rateType: 'fixed',
    },
  ],
};

const marketAbi = abiLendingMarket.find((abi) => abi.name === 'market');
const idToMarketParamsAbi = abiLendingMarket.find(
  (abi) => abi.name === 'idToMarketParams'
);
const marketConstantsAbi = abiLendingMarket.find(
  (abi) => abi.name === 'marketConstants'
);

const toNumber = (value, decimals = 18) => Number(value) / 10 ** decimals;

const toApyPercent = (ratePerSecond) => {
  if (!Number.isFinite(ratePerSecond) || ratePerSecond <= 0) return 0;
  const apy = Math.exp(ratePerSecond * SECONDS_PER_YEAR) - 1;
  return Number.isFinite(apy) ? apy * 100 : 0;
};

const mapSymbolAlias = (symbol) => API_ALIASES[symbol] || symbol;

const getSecondsToMaturity = async (bondToken) => {
  const getEndTimeAbi = abiBUSD0.find((abi) => abi.name === 'getEndTime');
  const result = await sdk.api.abi.call({
    target: bondToken,
    abi: getEndTimeAbi,
    chain: CHAIN,
  });
  const endTime = Number(result.output);
  return endTime - Math.floor(Date.now() / 1000);
};

const getPrices = async (addresses) => {
  if (!addresses.length) return {};
  const keys = [...new Set(addresses.map((a) => `${CHAIN}:${a.toLowerCase()}`))];
  const { data } = await axios.get(
    `https://coins.llama.fi/prices/current/${keys.join(',')}`
  );
  return data.coins || {};
};

const getUzrPool = async (prices) => {
  const { USD0PP, USD0, UZRLendingMarket, UZRLendingMarketId, LTV } = CONFIG.ethereum;
  const bUSD0price = prices[`${CHAIN}:${USD0PP.toLowerCase()}`]?.price ?? 0;
  const USD0price = prices[`${CHAIN}:${USD0.toLowerCase()}`]?.price ?? 0;

  const secondsToMaturity = await getSecondsToMaturity(USD0PP);
  const roi = bUSD0price > 0 ? (USD0price / bUSD0price - 1) * 100 : 0;
  const apr =
    Number.isFinite(secondsToMaturity) && secondsToMaturity > 0
      ? (roi * SECONDS_PER_YEAR) / secondsToMaturity
      : 0;

  const marketData = await sdk.api.abi.call({
    target: UZRLendingMarket,
    abi: marketAbi,
    params: [UZRLendingMarketId],
    chain: CHAIN,
  });

  const totalSupplyAssets =
    toNumber(marketData.output.totalSupplyAssets ?? marketData.output[0], 18);
  const totalBorrowAssets =
    toNumber(marketData.output.totalBorrowAssets ?? marketData.output[2], 18);
  const totalSupplyUsd = totalSupplyAssets * USD0price;
  const totalBorrowUsd = totalBorrowAssets * USD0price;
  const tvlUsd = totalSupplyUsd - totalBorrowUsd;
  const denom = 1 - LTV / (bUSD0price || 1);
  const maxLeverage = denom > 0 && Number.isFinite(denom) ? 1 / denom : 1;

  return {
    pool: UZRLendingMarket.toLowerCase(),
    chain: utils.formatChain(CHAIN),
    project: PROJECT,
    symbol: utils.formatSymbol('UZR'),
    tvlUsd,
    apyBase: apr,
    apyBaseBorrow: 0,
    totalSupplyUsd,
    totalBorrowUsd,
    underlyingTokens: [USD0PP],
    rewardTokens: [],
    ltv: LTV,
    poolMeta: `Max leverage ~${maxLeverage.toFixed(2)}x`,
    url: URL,
  };
};

const getMarketIds = async (lendingMarket) => {
  const currentBlock = await sdk.api.util.getLatestBlock(CHAIN);
  const logs = await sdk.getEventLogs({
    target: lendingMarket,
    eventAbi: EVENTS.CreateMarket,
    fromBlock: CONFIG.fromBlock,
    toBlock: currentBlock.number,
    chain: CHAIN,
  });
  return [...new Set(logs.map((log) => log.args.id.toLowerCase()))];
};

const getFixedRateInfo = async (loanToken) => {
  const [expiryRes, fwRes] = await Promise.all([
    sdk.api.abi.call({
      target: loanToken,
      abi: BOND_TOKEN_ABI.expiry,
      chain: CHAIN,
      permitFailure: true,
    }),
    sdk.api.abi.call({
      target: loanToken,
      abi: BOND_TOKEN_ABI.fw,
      chain: CHAIN,
      permitFailure: true,
    }),
  ]);

  const expiry = expiryRes?.output ? Number(expiryRes.output) : null;
  const fw = fwRes?.output ? fwRes.output.toLowerCase() : null;
  return { expiry, fw };
};

const getVariableBorrowRate = async (marketParams, marketState) => {
  if (!marketParams?.irm || marketParams.irm === '0x0000000000000000000000000000000000000000')
    return 0;

  const response = await sdk.api.abi.call({
    target: marketParams.irm,
    abi: IIIRM_BORROW_RATE_VIEW_ABI,
    params: [marketParams, marketState],
    chain: CHAIN,
    permitFailure: true,
  });

  return response?.output ? Number(response.output) / 1e18 : 0;
};

const buildPool = ({
  lendingMarket,
  rateType,
  marketId,
  marketState,
  marketParams,
  tokenMeta,
  prices,
  fixedRateInfo,
}) => {
  const loanToken = marketParams.loanToken.toLowerCase();
  const collateralToken = marketParams.collateralToken.toLowerCase();
  const { decimals = 18, symbol = loanToken } = tokenMeta[loanToken] || {};
  const loanTokenPrice = prices[`${CHAIN}:${loanToken}`]?.price ?? 0;

  const totalSupplyAssets = toNumber(
    marketState.totalSupplyAssets ?? marketState[0],
    decimals
  );
  const totalBorrowAssets = toNumber(
    marketState.totalBorrowAssets ?? marketState[2],
    decimals
  );
  const totalSupplyUsd = totalSupplyAssets * loanTokenPrice;
  const totalBorrowUsd = totalBorrowAssets * loanTokenPrice;
  const tvlUsd = totalSupplyUsd - totalBorrowUsd;
  const utilization = totalSupplyAssets > 0 ? totalBorrowAssets / totalSupplyAssets : 0;
  const fee = Number(marketState.fee ?? marketState[5] ?? 0) / 1e18;

  let borrowRatePerSecond = 0;
  let maturity = null;

  if (rateType === 'fixed') {
    maturity = fixedRateInfo?.expiry ?? null;
    const now = Math.floor(Date.now() / 1000);
    const secondsToMaturity = maturity && maturity > now ? maturity - now : 0;
    const fw = fixedRateInfo?.fw;
    const btPrice = prices[`${CHAIN}:${loanToken}`]?.price;
    const fwPrice = fw ? prices[`${CHAIN}:${fw}`]?.price : null;

    if (btPrice && fwPrice && secondsToMaturity > 0) {
      const grossReturn = fwPrice / btPrice - 1;
      const annualizedRate = grossReturn * (SECONDS_PER_YEAR / secondsToMaturity);
      borrowRatePerSecond =
        Number.isFinite(annualizedRate) && annualizedRate > 0
          ? annualizedRate / SECONDS_PER_YEAR
          : 0;
    }
  } else {
    borrowRatePerSecond = marketState.borrowRatePerSecond || 0;
  }

  const supplyRatePerSecond = borrowRatePerSecond * utilization * (1 - fee);
  const apyBaseBorrow = toApyPercent(borrowRatePerSecond);
  const apyBase = toApyPercent(supplyRatePerSecond);

  const metadata = [];
  metadata.push(rateType);
  if (rateType === 'fixed' && maturity) {
    metadata.push(`maturity ${new Date(maturity * 1000).toISOString().slice(0, 10)}`);
  }

  return {
    pool: `${lendingMarket.toLowerCase()}-${marketId}`,
    chain: utils.formatChain(CHAIN),
    project: PROJECT,
    symbol: utils.formatSymbol(mapSymbolAlias(symbol)),
    tvlUsd,
    apyBase,
    apyBaseBorrow,
    totalSupplyUsd,
    totalBorrowUsd,
    underlyingTokens: [loanToken],
    borrowable: true,
    ltv: Number(marketParams.lltv) / 1e18,
    mintedCoin: rateType === 'fixed' ? null : utils.formatSymbol(symbol),
    poolMeta: metadata.join(' | '),
    url: URL,
  };
};

const apy = async () => {
  const allMarkets = [];

  for (const lendingMarketConfig of CONFIG.lendingMarkets) {
    const marketIds = await getMarketIds(lendingMarketConfig.address);
    if (!marketIds.length) continue;

    const [marketStatesRes, marketParamsRes, marketConstantsRes] = await Promise.all([
      sdk.api.abi.multiCall({
        chain: CHAIN,
        abi: marketAbi,
        calls: marketIds.map((id) => ({
          target: lendingMarketConfig.address,
          params: [id],
        })),
      }),
      sdk.api.abi.multiCall({
        chain: CHAIN,
        abi: idToMarketParamsAbi,
        calls: marketIds.map((id) => ({
          target: lendingMarketConfig.address,
          params: [id],
        })),
      }),
      sdk.api.abi.multiCall({
        chain: CHAIN,
        abi: marketConstantsAbi,
        calls: marketIds.map((id) => ({
          target: lendingMarketConfig.address,
          params: [id],
        })),
      }),
    ]);

    const marketRows = marketIds.map((id, index) => ({
      lendingMarket: lendingMarketConfig.address,
      rateType: lendingMarketConfig.rateType,
      marketId: id,
      marketState: marketStatesRes.output[index]?.output,
      marketParams: marketParamsRes.output[index]?.output,
      marketConstants: marketConstantsRes.output[index]?.output,
    }));

    const variableRates = await Promise.all(
      marketRows.map(async (row) => {
        if (row.rateType !== 'variable') return 0;
        return getVariableBorrowRate(row.marketParams, row.marketState);
      })
    );

    marketRows.forEach((row, index) => {
      row.marketState.borrowRatePerSecond = variableRates[index];
    });

    allMarkets.push(...marketRows);
  }

  if (!allMarkets.length) return [];

  const loanTokens = allMarkets.map((market) => market.marketParams.loanToken.toLowerCase());
  const collateralTokens = allMarkets.map((market) =>
    market.marketParams.collateralToken.toLowerCase()
  );

  const fixedRateInfoByLoanToken = {};
  for (const market of allMarkets.filter((m) => m.rateType === 'fixed')) {
    const loanToken = market.marketParams.loanToken.toLowerCase();
    if (!fixedRateInfoByLoanToken[loanToken]) {
      fixedRateInfoByLoanToken[loanToken] = await getFixedRateInfo(loanToken);
    }
  }

  const fwTokens = Object.values(fixedRateInfoByLoanToken)
    .map((info) => info.fw)
    .filter(Boolean);
  const tokensForMeta = [...new Set([...loanTokens, ...collateralTokens])];
  const tokensForPrices = [...new Set([...tokensForMeta, ...fwTokens])];

  const [tokenMetaRes, prices] = await Promise.all([
    sdk.api.abi.multiCall({
      chain: CHAIN,
      abi: 'erc20:decimals',
      calls: tokensForMeta.map((token) => ({ target: token })),
      permitFailure: true,
    }),
    getPrices(tokensForPrices.concat([CONFIG.ethereum.USD0PP, CONFIG.ethereum.USD0])),
  ]);

  const tokenSymbolRes = await sdk.api.abi.multiCall({
    chain: CHAIN,
    abi: 'erc20:symbol',
    calls: tokensForMeta.map((token) => ({ target: token })),
    permitFailure: true,
  });

  const tokenMeta = {};
  tokensForMeta.forEach((token, index) => {
    tokenMeta[token] = {
      decimals: Number(tokenMetaRes.output[index]?.output ?? 18),
      symbol: tokenSymbolRes.output[index]?.output || token,
    };
  });

  const marketPools = allMarkets
    .map((market) =>
      buildPool({
        ...market,
        tokenMeta,
        prices,
        fixedRateInfo: fixedRateInfoByLoanToken[market.marketParams.loanToken.toLowerCase()],
      })
    )
    .filter((pool) => utils.keepFinite(pool));

  const uzrPool = await getUzrPool(prices);
  return [uzrPool, ...marketPools];
};

module.exports = {
  apy,
  url: URL,
  timetravel: false,
};
