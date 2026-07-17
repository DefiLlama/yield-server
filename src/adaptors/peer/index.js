const sdk = require('@defillama/sdk');
const utils = require('../utils');

const CHAIN = 'base';
const PROJECT = 'peer';
const PROTOCOL_ID = '6390';
const LOOKBACK_SECONDS = 7 * 24 * 60 * 60;
const SIGNAL_LOOKBACK_SECONDS = 5 * 24 * 60 * 60;
const SECONDS_PER_YEAR = 365 * 24 * 60 * 60;
const LOG_CHUNK_SIZE = 100_000;
const LOG_BATCH_SIZE = 5;
const MULTICALL_CHUNK_SIZE = 500;
const RPC_HEAD_LAG_BLOCKS = 25;
const USDC_DECIMALS = 6;
const WAD_DECIMALS = 18;
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

const ESCROW_V2 = '0x777777779d229cdF3110e9de47943791c26300Ef';
const ORCHESTRATOR_V2 = '0x888888359E981B5225CA48fbCdCeff702FC3b888';
const BASE_USDC = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';

const EVENTS = {
  IntentSignaled:
    'event IntentSignaled(bytes32 indexed intentHash,address indexed escrow,uint256 indexed depositId,bytes32 paymentMethod,address owner,address to,uint256 amount,bytes32 fiatCurrency,uint256 conversionRate,uint256 timestamp)',
  IntentFulfilled:
    'event IntentFulfilled(bytes32 indexed intentHash,address indexed fundsTransferredTo,uint256 amount,bool isManualRelease)',
  FundsUnlockedAndTransferred:
    'event FundsUnlockedAndTransferred(uint256 indexed depositId,bytes32 indexed intentHash,uint256 unlockedAmount,uint256 transferredAmount,address to)',
};

const ABI = {
  getDeposit: {
    inputs: [{ internalType: 'uint256', name: '_depositId', type: 'uint256' }],
    name: 'getDeposit',
    outputs: [
      {
        internalType: 'struct IEscrowV2.Deposit',
        name: '',
        type: 'tuple',
        components: [
          { internalType: 'address', name: 'depositor', type: 'address' },
          { internalType: 'address', name: 'delegate', type: 'address' },
          { internalType: 'contract IERC20', name: 'token', type: 'address' },
          {
            internalType: 'struct IEscrowV2.Range',
            name: 'intentAmountRange',
            type: 'tuple',
            components: [
              { internalType: 'uint256', name: 'min', type: 'uint256' },
              { internalType: 'uint256', name: 'max', type: 'uint256' },
            ],
          },
          { internalType: 'bool', name: 'acceptingIntents', type: 'bool' },
          {
            internalType: 'uint256',
            name: 'remainingDeposits',
            type: 'uint256',
          },
          {
            internalType: 'uint256',
            name: 'outstandingIntentAmount',
            type: 'uint256',
          },
          { internalType: 'address', name: 'intentGuardian', type: 'address' },
          { internalType: 'bool', name: 'retainOnEmpty', type: 'bool' },
        ],
      },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  depositCounter: 'function depositCounter() view returns (uint256)',
  getDepositPaymentMethods:
    'function getDepositPaymentMethods(uint256) view returns (bytes32[])',
  getDepositCurrencies:
    'function getDepositCurrencies(uint256,bytes32) view returns (bytes32[])',
  getDepositPaymentMethodActive:
    'function getDepositPaymentMethodActive(uint256,bytes32) view returns (bool)',
  getEffectiveRate:
    'function getEffectiveRate(uint256,bytes32,bytes32) view returns (uint256)',
  latestRoundData:
    'function latestRoundData() view returns (uint80 roundId,int256 answer,uint256 startedAt,uint256 updatedAt,uint80 answeredInRound)',
};

// Peer Earn currently supports new deposits in USD, EUR, and GBP. Limit both
// volume and liquidity to this priced set so APY does not mix unsupported
// liquidity with USD/EUR/GBP spread revenue.
const CURRENCY_FEEDS = {
  USD: { feed: ZERO_ADDRESS, decimals: 0, invert: false },
  EUR: {
    feed: '0xc91D87E81faB8f93699ECf7Ee9B44D11e1D53F0F',
    decimals: 8,
    heartbeat: 60 * 60,
    invert: true,
  },
  GBP: {
    feed: '0xCceA6576904C118037695eB71195a5425E69Fa15',
    decimals: 8,
    heartbeat: 24 * 60 * 60,
    invert: true,
  },
};

const CURRENCY_BY_HASH = {
  '0xc4ae21aac0c6549d71dd96035b7e0bdb6c79ebdba8891b666115bc976d16a29e': 'USD',
  '0xfff16d60be267153303bbfa66e593fb8d06e24ea5ef24b6acca5224c2ca6b907': 'EUR',
  '0x90832e2dc3221e4d56977c1aa8f6a6706b9ad6542fbbdaac13097d0fa5e42e67': 'GBP',
};
const SUPPORTED_CURRENCY_HASHES = new Set(Object.keys(CURRENCY_BY_HASH));

const PLATFORM_BY_PAYMENT_METHOD = {
  '0x90262a3db0edd0be2369c6b28f9e8511ec0bac7136cefbada0880602f87e7268': {
    key: 'venmo',
    label: 'Venmo',
  },
  '0x617f88ab82b5c1b014c539f7e75121427f0bb50a4c58b187a238531e7d58605d': {
    key: 'revolut',
    label: 'Revolut',
  },
  '0x10940ee67cfb3c6c064569ec92c0ee934cd7afa18dd2ca2d6a2254fcb009c17d': {
    key: 'cashapp',
    label: 'Cash App',
  },
  '0x5908bb0c9b87763ac6171d4104847667e7f02b4c47b574fe890c1f439ed128bb': {
    key: 'chime',
    label: 'Chime',
  },
  '0x554a007c2217df766b977723b276671aee5ebb4adaea0edb6433c88b3e61dac5': {
    key: 'wise',
    label: 'Wise',
  },
  '0x3ccc3d4d5e769b1f82dc4988485551dc0cd3c7a3926d7d8a4dde91507199490f': {
    key: 'paypal',
    label: 'PayPal',
  },
  '0x62c7ed738ad3e7618111348af32691b5767777fbaf46a2d8943237625552645c': {
    key: 'monzo',
    label: 'Monzo',
  },
  '0xf752c7d19698ecb0bb8988abf9b9a53a4c3657f3bc8850a6fb59fdf3e3ce8cd3': {
    key: 'zelle',
    label: 'Zelle',
  },
};

const asBigInt = (value) => BigInt(value.toString());

const formatAmount = (value, decimals) =>
  Number(asBigInt(value)) / 10 ** decimals;

const eventArg = (log, name, index) => {
  const args = log.args || log;
  if (args[name] !== undefined) return args[name];
  if (args[index] !== undefined) return args[index];
  return undefined;
};

const tupleField = (tuple, name, index) => {
  if (!tuple) return undefined;
  if (tuple[name] !== undefined) return tuple[name];
  if (tuple[index] !== undefined) return tuple[index];
  return undefined;
};

const unwrapSingleTuple = (output) => {
  if (!output) return null;
  if (tupleField(output, 'depositor', 0) !== undefined) return output;
  if (output[0] && tupleField(output[0], 'depositor', 0) !== undefined) {
    return output[0];
  }
  return output;
};

const arrayOutput = (output) => {
  if (!output) return [];
  if (Array.isArray(output))
    return output.map((value) => String(value).toLowerCase());
  if (Array.isArray(output[0])) {
    return output[0].map((value) => String(value).toLowerCase());
  }
  return [];
};

const platformForPaymentMethod = (paymentMethod) => {
  const normalized = String(paymentMethod || '').toLowerCase();
  return PLATFORM_BY_PAYMENT_METHOD[normalized] || null;
};

const chunkArray = (values, size) => {
  const chunks = [];
  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }
  return chunks;
};

async function multiCallInChunks({ abi, calls, block, chain = CHAIN }) {
  const output = [];
  for (const chunk of chunkArray(calls, MULTICALL_CHUNK_SIZE)) {
    const result = await sdk.api.abi.multiCall({
      chain,
      block,
      abi,
      calls: chunk,
      permitFailure: true,
    });
    output.push(...(result.output || []));
  }
  return output;
}

async function getEventLogsInChunks({
  target,
  eventAbi,
  fromBlock,
  toBlock,
  chain = CHAIN,
  chunkSize = LOG_CHUNK_SIZE,
}) {
  if (fromBlock > toBlock) return [];

  const ranges = [];
  for (let start = fromBlock; start <= toBlock; start += chunkSize) {
    ranges.push([start, Math.min(start + chunkSize - 1, toBlock)]);
  }

  const logs = [];
  for (let index = 0; index < ranges.length; index += LOG_BATCH_SIZE) {
    const batch = ranges.slice(index, index + LOG_BATCH_SIZE);
    const results = await Promise.all(
      batch.map(([from, to]) =>
        sdk.getEventLogs({
          target,
          eventAbi,
          fromBlock: from,
          toBlock: to,
          chain,
        })
      )
    );
    logs.push(...results.flat());
  }

  return logs;
}

async function fetchDepositIds(block) {
  const { output } = await sdk.api.abi.call({
    target: ESCROW_V2,
    abi: ABI.depositCounter,
    chain: CHAIN,
    block,
  });

  const depositCount = Number(asBigInt(output));
  return Array.from({ length: depositCount }, (_, index) => String(index));
}

async function fetchPlatformLiquidity(block, usdcPrice) {
  const depositIds = await fetchDepositIds(block);
  if (depositIds.length === 0) return new Map();

  const depositResults = await multiCallInChunks({
    block,
    abi: ABI.getDeposit,
    calls: depositIds.map((depositId) => ({
      target: ESCROW_V2,
      params: [depositId],
    })),
  });

  const deposits = [];
  for (let index = 0; index < depositResults.length; index++) {
    const entry = depositResults[index];
    if (entry?.success === false || !entry?.output) continue;

    const deposit = unwrapSingleTuple(entry.output);
    const depositor = String(
      tupleField(deposit, 'depositor', 0) || ''
    ).toLowerCase();
    const token = String(tupleField(deposit, 'token', 2) || '').toLowerCase();
    if (
      !depositor ||
      depositor === ZERO_ADDRESS ||
      token !== BASE_USDC.toLowerCase()
    ) {
      continue;
    }

    const remaining = asBigInt(tupleField(deposit, 'remainingDeposits', 5));
    const outstanding = asBigInt(
      tupleField(deposit, 'outstandingIntentAmount', 6)
    );
    const liquidity = remaining + outstanding;
    if (liquidity <= 0n) continue;

    deposits.push({ depositId: depositIds[index], liquidity });
  }
  if (deposits.length === 0) return new Map();

  const methodResults = await multiCallInChunks({
    block,
    abi: ABI.getDepositPaymentMethods,
    calls: deposits.map(({ depositId }) => ({
      target: ESCROW_V2,
      params: [depositId],
    })),
  });

  const methodPairs = [];
  for (let index = 0; index < deposits.length; index++) {
    for (const paymentMethod of arrayOutput(methodResults[index]?.output)) {
      methodPairs.push({ deposit: deposits[index], paymentMethod });
    }
  }
  if (methodPairs.length === 0) return new Map();

  const [activeResults, currencyResults] = await Promise.all([
    multiCallInChunks({
      block,
      abi: ABI.getDepositPaymentMethodActive,
      calls: methodPairs.map(({ deposit, paymentMethod }) => ({
        target: ESCROW_V2,
        params: [deposit.depositId, paymentMethod],
      })),
    }),
    multiCallInChunks({
      block,
      abi: ABI.getDepositCurrencies,
      calls: methodPairs.map(({ deposit, paymentMethod }) => ({
        target: ESCROW_V2,
        params: [deposit.depositId, paymentMethod],
      })),
    }),
  ]);

  const routeChecks = [];
  for (let index = 0; index < methodPairs.length; index++) {
    if (activeResults[index]?.output !== true) continue;

    const { deposit, paymentMethod } = methodPairs[index];
    const platform = platformForPaymentMethod(paymentMethod);
    if (!platform) continue;

    for (const currencyHash of arrayOutput(currencyResults[index]?.output)) {
      if (!SUPPORTED_CURRENCY_HASHES.has(currencyHash)) continue;
      routeChecks.push({ deposit, paymentMethod, platform, currencyHash });
    }
  }
  if (routeChecks.length === 0) return new Map();

  const rateResults = await multiCallInChunks({
    block,
    abi: ABI.getEffectiveRate,
    calls: routeChecks.map(({ deposit, paymentMethod, currencyHash }) => ({
      target: ESCROW_V2,
      params: [deposit.depositId, paymentMethod, currencyHash],
    })),
  });

  const platformBuckets = new Map();
  const routesByDeposit = new Map();
  for (let index = 0; index < routeChecks.length; index++) {
    const rate = rateResults[index]?.output;
    if (rate === undefined || asBigInt(rate) <= 0n) continue;

    const { deposit, platform } = routeChecks[index];
    const depositRoutes = routesByDeposit.get(deposit.depositId) || {
      deposit,
      platforms: new Map(),
    };
    depositRoutes.platforms.set(platform.key, platform);
    routesByDeposit.set(deposit.depositId, depositRoutes);
  }

  // A deposit's USDC backs every enabled payment method. Split it once across
  // unique platform pools so their aggregate TVL matches the escrowed balance.
  for (const { deposit, platforms } of routesByDeposit.values()) {
    const platformEntries = [...platforms.entries()].sort(([left], [right]) =>
      left.localeCompare(right)
    );
    const platformCount = BigInt(platformEntries.length);
    const liquidityShare = deposit.liquidity / platformCount;
    const remainder = deposit.liquidity % platformCount;

    for (let index = 0; index < platformEntries.length; index++) {
      const [platformKey, platform] = platformEntries[index];
      const existing = platformBuckets.get(platformKey) || {
        platform,
        liquidityRaw: 0n,
      };
      existing.liquidityRaw +=
        liquidityShare + (BigInt(index) < remainder ? 1n : 0n);
      platformBuckets.set(platformKey, existing);
    }
  }

  return new Map(
    [...platformBuckets.entries()].map(([platformKey, bucket]) => [
      platformKey,
      {
        platform: bucket.platform,
        tvlUsd: formatAmount(bucket.liquidityRaw, USDC_DECIMALS) * usdcPrice,
      },
    ])
  );
}

async function fetchMarketRates(block) {
  const rates = { USD: 1 };
  const feeds = Object.entries(CURRENCY_FEEDS).filter(
    ([code, config]) => code !== 'USD' && config.feed !== ZERO_ADDRESS
  );
  if (feeds.length === 0) return rates;

  const result = await sdk.api.abi.multiCall({
    chain: CHAIN,
    block,
    abi: ABI.latestRoundData,
    calls: feeds.map(([, config]) => ({ target: config.feed })),
    permitFailure: true,
  });

  for (let index = 0; index < feeds.length; index++) {
    const [code, config] = feeds[index];
    const entry = result.output[index];
    if (entry?.success === false || !entry?.output) continue;

    const answer = tupleField(entry.output, 'answer', 1);
    const updatedAt = tupleField(entry.output, 'updatedAt', 3);
    const updatedAtTimestamp =
      updatedAt === undefined ? null : asBigInt(updatedAt);
    const answeredInRound = tupleField(entry.output, 'answeredInRound', 4);
    const roundId = tupleField(entry.output, 'roundId', 0);
    const staleBefore = Math.floor(Date.now() / 1000) - config.heartbeat;
    if (
      answer === undefined ||
      asBigInt(answer) <= 0n ||
      updatedAtTimestamp === null ||
      updatedAtTimestamp === 0n ||
      updatedAtTimestamp < BigInt(staleBefore) ||
      asBigInt(answeredInRound) < asBigInt(roundId)
    ) {
      continue;
    }

    const feedRate = formatAmount(answer, config.decimals);
    rates[code] = config.invert ? 1 / feedRate : feedRate;
  }

  return rates;
}

async function fetchWindowStats(
  signalFromBlock,
  windowFromBlock,
  latestBlockNumber,
  usdcPrice
) {
  const [signalLogs, fulfillmentLogs, transferLogs, marketRates] =
    await Promise.all([
      getEventLogsInChunks({
        target: ORCHESTRATOR_V2,
        eventAbi: EVENTS.IntentSignaled,
        fromBlock: signalFromBlock,
        toBlock: latestBlockNumber,
      }),
      getEventLogsInChunks({
        target: ORCHESTRATOR_V2,
        eventAbi: EVENTS.IntentFulfilled,
        fromBlock: windowFromBlock,
        toBlock: latestBlockNumber,
      }),
      getEventLogsInChunks({
        target: ESCROW_V2,
        eventAbi: EVENTS.FundsUnlockedAndTransferred,
        fromBlock: windowFromBlock,
        toBlock: latestBlockNumber,
      }),
      fetchMarketRates(latestBlockNumber),
    ]);

  const signalsByHash = new Map();
  for (const log of signalLogs) {
    const intentHash = String(
      eventArg(log, 'intentHash', 0) || ''
    ).toLowerCase();
    if (!intentHash) continue;

    signalsByHash.set(intentHash, {
      amount: eventArg(log, 'amount', 6),
      conversionRate: eventArg(log, 'conversionRate', 8),
      currencyHash: String(
        eventArg(log, 'fiatCurrency', 7) || ''
      ).toLowerCase(),
      escrow: String(eventArg(log, 'escrow', 1) || '').toLowerCase(),
      paymentMethod: String(
        eventArg(log, 'paymentMethod', 3) || ''
      ).toLowerCase(),
    });
  }

  const transferAmountByHash = new Map();
  for (const log of transferLogs) {
    const intentHash = String(
      eventArg(log, 'intentHash', 1) || ''
    ).toLowerCase();
    if (!intentHash) continue;
    transferAmountByHash.set(intentHash, eventArg(log, 'transferredAmount', 3));
  }

  const platformStats = new Map();

  for (const log of fulfillmentLogs) {
    const intentHash = String(
      eventArg(log, 'intentHash', 0) || ''
    ).toLowerCase();
    const signal = signalsByHash.get(intentHash);
    if (!signal) continue;
    if (signal.escrow !== ESCROW_V2.toLowerCase()) continue;

    const grossAmount = transferAmountByHash.get(intentHash);
    if (grossAmount === undefined) continue;

    const amountUsd = formatAmount(grossAmount, USDC_DECIMALS) * usdcPrice;
    if (!Number.isFinite(amountUsd) || amountUsd <= 0) continue;

    const currencyCode = CURRENCY_BY_HASH[signal.currencyHash];
    const marketRate = marketRates[currencyCode];
    if (!currencyCode || !Number.isFinite(marketRate) || marketRate <= 0) {
      continue;
    }

    const conversionRate = formatAmount(signal.conversionRate, WAD_DECIMALS);
    const spread = (conversionRate - marketRate) / marketRate;
    const platform = platformForPaymentMethod(signal.paymentMethod);
    if (!platform) continue;

    const existing = platformStats.get(platform.key) || {
      platform,
      volumeUsd: 0,
      spreadWeightedVolume: 0,
      fills: 0,
    };

    existing.volumeUsd += amountUsd;
    existing.spreadWeightedVolume += Math.max(spread, 0) * amountUsd;
    existing.fills += 1;
    platformStats.set(platform.key, existing);
  }

  return new Map(
    [...platformStats.entries()].map(([platformKey, stats]) => [
      platformKey,
      {
        platform: stats.platform,
        volumeUsd: stats.volumeUsd,
        weightedPositiveSpread:
          stats.volumeUsd > 0
            ? stats.spreadWeightedVolume / stats.volumeUsd
            : 0,
        fills: stats.fills,
      },
    ])
  );
}

async function fetchUsdcPrice() {
  const { pricesByAddress } = await utils.getPrices([BASE_USDC], CHAIN);
  const usdcPrice = pricesByAddress[BASE_USDC.toLowerCase()];
  if (!Number.isFinite(usdcPrice) || usdcPrice <= 0) {
    throw new Error(`Invalid USDC price for ${CHAIN}:${BASE_USDC}`);
  }
  return usdcPrice;
}

async function apy() {
  const latestBlock = await sdk.api.util.getLatestBlock(CHAIN);
  const latestBlockNumber = Math.max(
    latestBlock.number - RPC_HEAD_LAG_BLOCKS,
    0
  );
  const windowStart = latestBlock.timestamp - LOOKBACK_SECONDS;
  const signalWindowStart = windowStart - SIGNAL_LOOKBACK_SECONDS;
  const [signalFromBlock, windowFromBlock, usdcPrice] = await Promise.all([
    sdk.api.util.lookupBlock(signalWindowStart, { chain: CHAIN }),
    sdk.api.util.lookupBlock(windowStart, { chain: CHAIN }),
    fetchUsdcPrice(),
  ]);

  const [liquidityByPlatform, statsByPlatform] = await Promise.all([
    fetchPlatformLiquidity(latestBlockNumber, usdcPrice),
    fetchWindowStats(
      signalFromBlock.block,
      windowFromBlock.block,
      latestBlockNumber,
      usdcPrice
    ),
  ]);

  return [...liquidityByPlatform.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([platformKey, liquidity]) => {
      const stats = statsByPlatform.get(platformKey) || {
        volumeUsd: 0,
        weightedPositiveSpread: 0,
      };
      const apyBase =
        liquidity.tvlUsd > 0 && stats.volumeUsd > 0
          ? stats.weightedPositiveSpread *
            (stats.volumeUsd / liquidity.tvlUsd) *
            (SECONDS_PER_YEAR / LOOKBACK_SECONDS) *
            100
          : 0;
      return {
        pool: `${ESCROW_V2}-${CHAIN}-${platformKey}`.toLowerCase(),
        chain: utils.formatChain(CHAIN),
        project: PROJECT,
        symbol: 'USDC',
        tvlUsd: liquidity.tvlUsd,
        apyBase,
        underlyingTokens: [BASE_USDC],
        token: null,
        poolMeta: liquidity.platform.label,
        url: 'https://app.peer.xyz/liquidity',
      };
    });
}

module.exports = {
  timetravel: false,
  apy,
  url: 'https://www.peer.xyz/',
  protocolId: PROTOCOL_ID,
};
