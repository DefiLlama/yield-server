const axios = require('axios');
const sdk = require('@defillama/sdk');
const utils = require('../utils');
const abiBUSD0 = require('./abiBUSD0');
const abiLendingMarket = require('./abiLendingMarket');

const PROJECT = 'fira';
const URLS = {
  REWARD_APR_RATE: 'https://app.fira.money/api/apr/pools',
  DAPP: 'https://app.fira.money',
};
const CHAIN = 'ethereum';
const BCLP_ORACLE = '0xfEAAEC9124FB007d7c44Ed704A08d24b264de921';
const FIRA_MARKET_FACTORY = '0xBF1EfC2199ae9EE1B6f5060a45D4440157E49744';
const SECONDS_PER_YEAR = 365 * 24 * 60 * 60;
const WAD = 1e18;
const API_ALIASES = {
  'USD0++': 'bUSD0',
};

const EVENTS = {
  CreateMarket:
    'event CreateMarket(bytes32 indexed id, tuple(address loanToken,address collateralToken,address oracle,address irm,uint256 ltv,uint256 lltv,address whitelist) marketParams)',
  CreateNewMarket:
    'event CreateNewMarket(address indexed market, address indexed BT, int256 scalarRoot, int256 initialAnchor, uint80 lnFeeRateRoot)',
};

const BOND_TOKEN_ABI = {
  expiry: 'function expiry() view returns (uint256)',
  fw: 'function FW() view returns (address)',
};
const PENDLE_PT_ABI = {
  sy: 'function SY() view returns (address)',
};
const WRAPPED_TOKEN_ABI = {
  assetInfo:
    'function assetInfo() view returns (uint8 assetType,address assetAddress,uint8 assetDecimals)',
};
const BCLP_ORACLE_ABI = {
  btToAssetRate:
    'function getBtToAssetRate(address market, uint32 duration) view returns (uint256)',
  btToFwRate:
    'function getBtToFwRate(address market, uint32 duration) view returns (uint256)',
};
const FIRA_MARKET_ABI = {
  readTokens:
    'function readTokens() view returns (address _FW,address _BT,address _CT)',
  readState:
    'function readState(address router) view returns ((int256 totalBt,int256 totalFw,int256 totalLp,address treasury,int256 scalarRoot,uint256 expiry,uint256 lnFeeRateRoot,uint256 reserveFeePercent,uint256 lastLnImpliedRate))',
};

const IIIRM_BORROW_RATE_VIEW_ABI =
  'function borrowRateView((address loanToken,address collateralToken,address oracle,address irm,uint256 ltv,uint256 lltv,address whitelist) marketParams,(uint128 totalSupplyAssets,uint128 totalSupplyShares,uint128 totalBorrowAssets,uint128 totalBorrowShares,uint128 lastUpdate,uint128 fee) market) view returns (uint256)';

const CONFIG = {
  ETHEREUM: {
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
  fixedMarketsByLoanToken: {
    '0x33fd40ed7744c961b61a086a87f83787bd9606ee':
      '0x400922e37d608620672dc1f1b7a25ecbaabb57f8',
  },
  sisuVaults: [
    {
      address: '0x50791a5cA041b9D6Dd03e64E3Fa0e34a376759AC',
      rateType: 'variable',
    },
    {
      address: '0xf12d8e85c387e259c1bad1cb571dade0a99c0a21',
      rateType: 'variable',
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

const preferOnchainApy = (onchainApy, apiApy) => {
  if (Number.isFinite(onchainApy) && onchainApy > 0) return onchainApy;
  if (Number.isFinite(apiApy)) return apiApy;
  return onchainApy;
};

const mapSymbolAlias = (symbol) => API_ALIASES[symbol] || symbol;
const formatRateTypePoolMeta = (rateType) =>
  rateType === 'fixed'
    ? 'Fixed Rate'
    : rateType === 'variable'
      ? 'Variable Rate'
      : rateType;
const getBtBaseTokenSymbol = (symbol = '') => {
  const match = String(symbol).match(/^BT-([^-]+)/i);
  return match ? match[1].toUpperCase() : null;
};

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
  const keys = [
    ...new Set(addresses.map((a) => `${CHAIN}:${a.toLowerCase()}`)),
  ];
  const data = await utils.getPriceApiData(`/prices/current/${keys.join(',')}`);
  return data.coins || {};
};

const getRewardAprMap = async () => {
  const { data } = await axios.get(URLS.REWARD_APR_RATE);
  if (!Array.isArray(data)) return {};
  return data.reduce((acc, pool) => {
    const poolKey = (pool?.pool || '').toLowerCase();
    if (!poolKey) return acc;
    acc[poolKey] = pool;
    return acc;
  }, {});
};

const getUzrPool = async (prices) => {
  const { USD0PP, USD0, UZRLendingMarket, UZRLendingMarketId, LTV } =
    CONFIG.ETHEREUM;
  const bUSD0price = prices[`${CHAIN}:${USD0PP.toLowerCase()}`]?.price ?? 0;
  const USD0price = prices[`${CHAIN}:${USD0.toLowerCase()}`]?.price ?? 0;

  const secondsToMaturity = await getSecondsToMaturity(USD0PP);
  const roi = bUSD0price > 0 ? (USD0price / bUSD0price - 1) * 100 : 0;
  const apr =
    Number.isFinite(secondsToMaturity) && secondsToMaturity > 0
      ? (roi * SECONDS_PER_YEAR) / secondsToMaturity
      : 0;

  const [marketData, collateralBalanceRes] = await Promise.all([
    sdk.api.abi.call({
      target: UZRLendingMarket,
      abi: marketAbi,
      params: [UZRLendingMarketId],
      chain: CHAIN,
    }),
    sdk.api.abi.call({
      target: USD0PP,
      abi: 'erc20:balanceOf',
      params: [UZRLendingMarket],
      chain: CHAIN,
    }),
  ]);

  const totalSupplyAssets = toNumber(
    marketData.output.totalSupplyAssets ?? marketData.output[0],
    18
  );
  const totalBorrowAssets = toNumber(
    marketData.output.totalBorrowAssets ?? marketData.output[2],
    18
  );
  const totalLoanSupplyUsd = totalSupplyAssets * USD0price;
  const totalSupplyUsd = toNumber(collateralBalanceRes.output, 18) * bUSD0price;
  const totalBorrowUsd = totalBorrowAssets * USD0price;
  let availableBorrowUsd = Math.max(totalLoanSupplyUsd - totalBorrowUsd, 0);
  const tvlUsd = availableBorrowUsd;
  const denom = 1 - LTV / (bUSD0price || 1);
  const maxLeverage = denom > 0 && Number.isFinite(denom) ? 1 / denom : 1;

  // TODO: decide final UZR shape. Docs describe UZR as an isolated borrow
  // market: users deposit bUSD0 as collateral and borrow USD0 against it, while
  // the Usual DAO is the sole lender supplying USD0 liquidity. That means users
  // cannot lend into this market for Fira supply yield. The displayed yield is
  // bUSD0's implied discount-to-maturity carry from holding/looping bUSD0, not
  // Fira paying supply-side APY. For now, preserve this adapter's prior UZR
  // output shape and keep the maturity carry on apyBase.
  return {
    pool: UZRLendingMarket.toLowerCase(),
    chain: utils.formatChain(CHAIN),
    project: PROJECT,
    symbol: 'UZR',
    tvlUsd,
    apyBase: apr,
    apyBaseBorrow: 0,
    totalSupplyUsd,
    totalBorrowUsd,
    availableBorrowUsd,
    underlyingTokens: [USD0PP],
    borrowToken: USD0,
    rewardTokens: [],
    borrowable: availableBorrowUsd > 0,
    ltv: LTV,
    poolMeta: `Max leverage ~${maxLeverage.toFixed(2)}x`,
    url: URLS.DAPP,
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

const getFixedPoolToFiraMarket = async (fixedPools) => {
  if (!fixedPools.length) return {};

  const currentBlock = await sdk.api.util.getLatestBlock(CHAIN);
  const marketLogs = await sdk.getEventLogs({
    target: FIRA_MARKET_FACTORY,
    eventAbi: EVENTS.CreateNewMarket,
    fromBlock: CONFIG.fromBlock,
    toBlock: currentBlock.number,
    chain: CHAIN,
  });
  const marketAddresses = [
    ...new Set(marketLogs.map((log) => log.args.market.toLowerCase())),
  ];
  if (!marketAddresses.length) return {};

  const readTokensRes = await sdk.api.abi.multiCall({
    chain: CHAIN,
    abi: FIRA_MARKET_ABI.readTokens,
    calls: marketAddresses.map((market) => ({ target: market })),
    permitFailure: true,
  });

  const btToMarket = {};
  readTokensRes.output.forEach((res) => {
    if (!res.success || !res.output) return;
    const bt = (res.output._BT || res.output[1] || '').toLowerCase();
    if (!bt) return;
    // Map by BT only. If multiple markets share the same BT, keep the first discovered.
    if (!btToMarket[bt]) btToMarket[bt] = res.input.target.toLowerCase();
  });

  const fixedPoolToMarket = {};
  fixedPools.forEach((pool) => {
    const bt = pool.marketParams.loanToken.toLowerCase();
    const poolKey = `${pool.lendingMarket.toLowerCase()}-${pool.marketId}`;
    fixedPoolToMarket[poolKey] = btToMarket[bt] || null;
  });

  return fixedPoolToMarket;
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
  if (
    !marketParams?.irm ||
    marketParams.irm === '0x0000000000000000000000000000000000000000'
  )
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
  collateralUnderlyingByToken,
  fixedMarketStateByPool,
  aprPoolData,
  collateralBalance,
}) => {
  const loanToken = marketParams.loanToken.toLowerCase();
  const collateralToken = marketParams.collateralToken.toLowerCase();
  const { decimals, symbol: loanSymbolRaw = loanToken } =
    tokenMeta[loanToken] || {};
  const { symbol: collateralSymbolRaw = collateralToken } =
    tokenMeta[collateralToken] || {};
  if (!Number.isFinite(decimals)) return null;
  const loanSymbol = mapSymbolAlias(loanSymbolRaw);
  const collateralSymbol = mapSymbolAlias(collateralSymbolRaw);
  const baseLoanTokenPrice = prices[`${CHAIN}:${loanToken}`]?.price ?? 0;
  const loanTokenPrice =
    rateType === 'fixed' && (!baseLoanTokenPrice || baseLoanTokenPrice <= 0)
      ? fixedRateInfo?.underlyingPrice ?? 0
      : baseLoanTokenPrice;
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
  let availableBorrowUsd = Math.max(totalSupplyUsd - totalBorrowUsd, 0);
  const collateralDecimals = tokenMeta[collateralToken]?.decimals;
  const collateralSupplyUsd = Number.isFinite(collateralDecimals)
    ? toNumber(collateralBalance || 0, collateralDecimals) *
      (prices[`${CHAIN}:${collateralToken}`]?.price ?? 0)
    : 0;
  const poolTotalSupplyUsd = collateralSupplyUsd;

  let borrowRatePerSecond = 0;
  let maturity = null;

  if (rateType === 'fixed') {
    maturity = fixedRateInfo?.expiry ?? null;
    const poolKey = `${lendingMarket.toLowerCase()}-${marketId}`;
    const marketState = fixedMarketStateByPool[poolKey];
    if (maturity && maturity < Math.floor(Date.now() / 1000)) return null;
    const totalFw = Number(
      marketState?.totalFw ??
        marketState?.[1] ??
        marketState?.market?.totalFw ??
        0
    );
    availableBorrowUsd = Math.max(toNumber(totalFw, 6) * loanTokenPrice, 0);
    const lastLnImpliedRate = Number(
      marketState?.lastLnImpliedRate ??
        marketState?.[8] ??
        marketState?.market?.lastLnImpliedRate ??
        0
    );
    if (lastLnImpliedRate > 0) {
      const btApr = Math.exp(lastLnImpliedRate / WAD) - 1;
      borrowRatePerSecond =
        Number.isFinite(btApr) && btApr > 0 ? btApr / SECONDS_PER_YEAR : 0;
    }
  } else {
    borrowRatePerSecond = marketState.borrowRatePerSecond || 0;
  }

  const computedApyBaseBorrow = toApyPercent(borrowRatePerSecond);
  const tvlUsd = availableBorrowUsd;

  return {
    pool: `${lendingMarket.toLowerCase()}-${marketId}`,
    chain: utils.formatChain(CHAIN),
    project: PROJECT,
    symbol: collateralSymbol,
    tvlUsd,
    apyBase: 0,
    apyBaseBorrow: preferOnchainApy(
      computedApyBaseBorrow,
      aprPoolData?.apyBaseBorrow
    ),
    totalSupplyUsd: poolTotalSupplyUsd,
    totalBorrowUsd,
    availableBorrowUsd,
    underlyingTokens: [collateralToken],
    borrowable: availableBorrowUsd > 0,
    ltv: Number(marketParams.lltv) / 1e18,
    mintedCoin: utils.formatSymbol(
      fixedRateInfo?.underlyingToken
        ? tokenMeta[fixedRateInfo.underlyingToken]?.symbol || loanSymbol
        : loanSymbol
    ),
    borrowToken: fixedRateInfo?.underlyingToken || loanToken,
    poolMeta: formatRateTypePoolMeta(rateType),
    url: URLS.DAPP,
  };
};

const apy = async () => {
  const [aprPoolMap] = await Promise.all([getRewardAprMap()]);
  const allMarkets = [];

  for (const lendingMarketConfig of CONFIG.lendingMarkets) {
    const marketIds = await getMarketIds(lendingMarketConfig.address);
    if (!marketIds.length) continue;

    const [marketStatesRes, marketParamsRes, marketConstantsRes] =
      await Promise.all([
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

  const loanTokens = allMarkets.map((market) =>
    market.marketParams.loanToken.toLowerCase()
  );
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

  const tokensForMeta = [...new Set([...loanTokens, ...collateralTokens])];

  const fwTokens = Object.values(fixedRateInfoByLoanToken)
    .map((info) => info.fw)
    .filter(Boolean);
  const fwAssetInfoRes = fwTokens.length
    ? await sdk.api.abi.multiCall({
        chain: CHAIN,
        abi: WRAPPED_TOKEN_ABI.assetInfo,
        calls: fwTokens.map((fw) => ({ target: fw })),
        permitFailure: true,
      })
    : { output: [] };
  const fwTotalSupplyRes = fwTokens.length
    ? await sdk.api.abi.multiCall({
        chain: CHAIN,
        abi: 'erc20:totalSupply',
        calls: fwTokens.map((fw) => ({ target: fw })),
        permitFailure: true,
      })
    : { output: [] };

  const fwToUnderlying = {};
  fwAssetInfoRes.output.forEach((res) => {
    const fw = res.input.target.toLowerCase();
    const assetAddress = res?.output?.assetAddress ?? res?.output?.[1];
    if (assetAddress) fwToUnderlying[fw] = assetAddress.toLowerCase();
  });
  const fwTotalSupplyByToken = {};
  fwTotalSupplyRes.output.forEach((res) => {
    if (!res.success || !res.output) return;
    fwTotalSupplyByToken[res.input.target.toLowerCase()] = res.output;
  });

  Object.values(fixedRateInfoByLoanToken).forEach((info) => {
    const underlyingToken = info.fw ? fwToUnderlying[info.fw] : null;
    info.underlyingToken = underlyingToken || null;
  });

  const fixedPools = allMarkets.filter((m) => m.rateType === 'fixed');
  const fixedMarketStateByPool = {};
  let fixedPoolToMarket = {};
  if (fixedPools.length) {
    fixedPoolToMarket = await getFixedPoolToFiraMarket(fixedPools);
    const fixedReadStateRes = await sdk.api.abi.multiCall({
      chain: CHAIN,
      abi: FIRA_MARKET_ABI.readState,
      calls: fixedPools.map((m) => ({
        target:
          fixedPoolToMarket[`${m.lendingMarket.toLowerCase()}-${m.marketId}`] ||
          CONFIG.fixedMarketsByLoanToken[
            m.marketParams.loanToken.toLowerCase()
          ] ||
          '0x0000000000000000000000000000000000000000',
        params: [BCLP_ORACLE],
      })),
      permitFailure: true,
    });

    fixedPools.forEach((m, index) => {
      const poolKey = `${m.lendingMarket.toLowerCase()}-${m.marketId}`;
      fixedMarketStateByPool[poolKey] = fixedReadStateRes.output[index]?.output;
    });
  }

  // Collateral may be Pendle PT: PT -> SY -> assetInfo() -> underlying asset.
  const collateralSyRes = collateralTokens.length
    ? await sdk.api.abi.multiCall({
        chain: CHAIN,
        abi: PENDLE_PT_ABI.sy,
        calls: collateralTokens.map((token) => ({ target: token })),
        permitFailure: true,
      })
    : { output: [] };
  const collateralToSy = {};
  collateralSyRes.output.forEach((res) => {
    if (!res.success || !res.output) return;
    collateralToSy[res.input.target.toLowerCase()] = res.output.toLowerCase();
  });
  const collateralSyTokens = [...new Set(Object.values(collateralToSy))];
  const collateralSyAssetInfoRes = collateralSyTokens.length
    ? await sdk.api.abi.multiCall({
        chain: CHAIN,
        abi: WRAPPED_TOKEN_ABI.assetInfo,
        calls: collateralSyTokens.map((sy) => ({ target: sy })),
        permitFailure: true,
      })
    : { output: [] };
  const syToUnderlying = {};
  collateralSyAssetInfoRes.output.forEach((res) => {
    const sy = res.input.target.toLowerCase();
    const assetAddress = res?.output?.assetAddress ?? res?.output?.[1];
    if (assetAddress) syToUnderlying[sy] = assetAddress.toLowerCase();
  });
  const collateralToUnderlying = {};
  Object.entries(collateralToSy).forEach(([collateral, sy]) => {
    if (syToUnderlying[sy])
      collateralToUnderlying[collateral] = syToUnderlying[sy];
  });

  const fixedUnderlyingTokens = Object.values(fixedRateInfoByLoanToken)
    .map((info) => info.underlyingToken)
    .filter(Boolean);
  const tokensForPrices = [
    ...new Set([
      ...tokensForMeta,
      ...fwTokens,
      ...fixedUnderlyingTokens,
      ...Object.values(collateralToUnderlying),
    ]),
  ];

  const [tokenMetaRes, prices] = await Promise.all([
    sdk.api.abi.multiCall({
      chain: CHAIN,
      abi: 'erc20:decimals',
      calls: tokensForMeta.map((token) => ({ target: token })),
      permitFailure: true,
    }),
    getPrices(
      tokensForPrices.concat([CONFIG.ETHEREUM.USD0PP, CONFIG.ETHEREUM.USD0])
    ),
  ]);

  const tokenSymbolRes = await sdk.api.abi.multiCall({
    chain: CHAIN,
    abi: 'erc20:symbol',
    calls: tokensForPrices.map((token) => ({ target: token })),
    permitFailure: true,
  });

  const tokenMeta = {};
  const tokenSymbolMap = {};
  tokensForPrices.forEach((token, index) => {
    tokenSymbolMap[token] = tokenSymbolRes.output[index]?.output || token;
  });
  tokensForMeta.forEach((token, index) => {
    const rawDecimals = tokenMetaRes.output[index]?.output;
    tokenMeta[token] = {
      decimals: rawDecimals === undefined ? null : Number(rawDecimals),
      symbol: tokenSymbolMap[token] || token,
    };
  });
  // Add symbols for non-meta tokens used in fixed underlying annotations.
  tokensForPrices.forEach((token) => {
    if (!tokenMeta[token]) {
      tokenMeta[token] = {
        decimals: null,
        symbol: tokenSymbolMap[token] || token,
      };
    }
  });

  // If collateral is PT and lacks symbol metadata, use its underlying symbol.
  Object.entries(collateralToUnderlying).forEach(([collateral, underlying]) => {
    const collateralSymbol = tokenMeta[collateral]?.symbol;
    const underlyingSymbol = tokenMeta[underlying]?.symbol;
    if (
      (!collateralSymbol ||
        collateralSymbol.toLowerCase() === collateral.toLowerCase()) &&
      underlyingSymbol
    ) {
      tokenMeta[collateral] = {
        ...(tokenMeta[collateral] || {}),
        symbol: underlyingSymbol,
      };
    }
  });

  Object.values(fixedRateInfoByLoanToken).forEach((info) => {
    const underlyingToken = info.underlyingToken;
    info.underlyingPrice = underlyingToken
      ? prices[`${CHAIN}:${underlyingToken}`]?.price ?? null
      : null;
    const fwUnderlyingToken = info.fw ? fwToUnderlying[info.fw] : null;
    info.fwUnderlyingPrice = fwUnderlyingToken
      ? prices[`${CHAIN}:${fwUnderlyingToken}`]?.price ?? null
      : null;
  });

  const collateralBalanceRes = await sdk.api.abi.multiCall({
    chain: CHAIN,
    abi: 'erc20:balanceOf',
    calls: allMarkets.map((market) => ({
      target: market.marketParams.collateralToken.toLowerCase(),
      params: [market.lendingMarket],
    })),
    permitFailure: true,
  });

  const marketPools = allMarkets
    .map((market, index) =>
      buildPool({
        ...market,
        tokenMeta,
        prices,
        fixedRateInfo:
          fixedRateInfoByLoanToken[market.marketParams.loanToken.toLowerCase()],
        collateralUnderlyingByToken: collateralToUnderlying,
        fixedMarketStateByPool,
        aprPoolData:
          aprPoolMap[
            `${market.lendingMarket.toLowerCase()}-${
              market.marketId
            }`.toLowerCase()
          ],
        collateralBalance: collateralBalanceRes.output[index]?.output,
      })
    )
    .filter(Boolean)
    .filter((pool) => utils.keepFinite(pool));

  const fixedLendPools = Object.values(
    fixedPools.reduce((acc, market) => {
      const poolKey = `${market.lendingMarket.toLowerCase()}-${market.marketId}`;
      const fixedRateInfo =
        fixedRateInfoByLoanToken[market.marketParams.loanToken.toLowerCase()];
      const maturity = fixedRateInfo?.expiry ?? null;
      if (!maturity || maturity < Math.floor(Date.now() / 1000)) return acc;
      const fixedMarket =
        fixedPoolToMarket[poolKey] ||
        CONFIG.fixedMarketsByLoanToken[
          market.marketParams.loanToken.toLowerCase()
        ];
      const marketState = fixedMarketStateByPool[poolKey];
      const underlyingToken = fixedRateInfo?.underlyingToken;
      const underlyingPrice = fixedRateInfo?.underlyingPrice ?? 0;
      if (!fixedMarket || !marketState || !underlyingToken) return acc;
      const lastLnImpliedRate = Number(
        marketState?.lastLnImpliedRate ??
          marketState?.[8] ??
          marketState?.market?.lastLnImpliedRate ??
          0
      );
      const btApr =
        lastLnImpliedRate > 0 ? Math.exp(lastLnImpliedRate / WAD) - 1 : 0;
      const apyBase = toApyPercent(btApr / SECONDS_PER_YEAR);
      const decimals =
        tokenMeta[market.marketParams.loanToken.toLowerCase()]?.decimals ?? 6;
      const tvlUsd =
        toNumber(fwTotalSupplyByToken[fixedRateInfo.fw] || 0, decimals) *
        underlyingPrice;
      acc[fixedMarket] = {
        pool: fixedMarket,
        chain: utils.formatChain(CHAIN),
        project: PROJECT,
        symbol: utils.formatSymbol(tokenMeta[underlyingToken]?.symbol || 'USDC'),
        tvlUsd,
        apyBase,
        underlyingTokens: [underlyingToken],
        poolMeta: formatRateTypePoolMeta(market.rateType),
        url: URLS.DAPP,
      };
      return acc;
    }, {})
  ).filter((pool) => utils.keepFinite(pool));

  const sisuPools = CONFIG.sisuVaults
    .map((vault) => {
      const poolKey = vault.address.toLowerCase();
      const aprPoolData = aprPoolMap[poolKey];
      if (!aprPoolData) return null;
      const {
        apyBaseBorrow,
        totalBorrowUsd,
        borrowable,
        ltv,
        mintedCoin,
        borrowToken,
        poolMeta,
        rewardTokens,
        totalSupplyUsd,
        ...pool
      } = aprPoolData;
      const [underlyingToken] = pool.underlyingTokens || [];
      return {
        ...pool,
        pool: poolKey,
        symbol: utils.formatSymbol(
          tokenMeta[underlyingToken?.toLowerCase()]?.symbol || pool.symbol
        ),
        poolMeta: formatRateTypePoolMeta(vault.rateType),
        url: pool.url || URLS.DAPP,
      };
    })
    .filter(Boolean)
    .filter((pool) => utils.keepFinite(pool));

  const uzrPool = await getUzrPool(prices);
  return [uzrPool, ...marketPools, ...fixedLendPools, ...sisuPools];
};

module.exports = {
  protocolId: '7329',
  apy,
  url: URLS.DAPP,
  timetravel: false,
};
