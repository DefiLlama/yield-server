const sdk = require('@defillama/sdk');
const axios = require('axios');

const PROJECT = 'deltausd';
const URL = 'https://deltausd.com/protocol';
const RESERVE_TVL_URL = 'https://api.llama.fi/protocol/deltausd';
const MAX_RESERVE_AGE = 2 * 86400;
const NETWORK = {
  chain: 'bsc',
  name: 'Binance',
  token: '0x1851302297e318d658829fd94b89d5ae6528cb9e',
  collateral: '0x55d398326f99059ff775485246999027b3197955',
  collateralDecimals: 18,
};
const UINT_FIELDS = [
  'apr',
  'basePrice',
  'startTime',
  'getCurrentPrice',
  'holdPeriod',
  'APR_DENOMINATOR',
  'SECONDS_IN_YEAR',
  'PRICE_SCALE',
  'DUSD_UNIT',
  'USDT_UNIT',
];

function asUint(value, name) {
  if (!/^\d+$/.test(String(value))) throw new Error(`Invalid ${name}`);
  return BigInt(value);
}

function positiveNumber(value, name, allowZero = false) {
  if (!Number.isFinite(value) || (allowZero ? value < 0 : value <= 0)) {
    throw new Error(`Invalid ${name}`);
  }
  return value;
}

async function readState(network) {
  const api = new sdk.ChainApi({ chain: network.chain });
  const block = await api.getBlock();
  // Every contract read and the timestamp use the same block.
  const [
    values,
    header,
    collateral,
    paused,
    tokenDecimals,
    collateralDecimals,
    redeemQuote,
  ] = await Promise.all([
    Promise.all(
      UINT_FIELDS.map((name) =>
        api.call({
          target: network.token,
          abi: `uint256:${name}`,
        })
      )
    ),
    api.provider.getBlock(block),
    api.call({ target: network.token, abi: 'address:usdt' }),
    api.call({ target: network.token, abi: 'bool:paused' }),
    api.call({ target: network.token, abi: 'erc20:decimals' }),
    api.call({ target: network.collateral, abi: 'erc20:decimals' }),
    api.call({
      target: network.token,
      abi: 'function quoteRedeem(uint256) view returns (uint256)',
      params: ['1000000000000000000'],
    }),
  ]);
  if (
    collateral.toLowerCase() !== network.collateral ||
    Number(tokenDecimals) !== 18 ||
    Number(collateralDecimals) !== network.collateralDecimals ||
    typeof paused !== 'boolean'
  ) {
    throw new Error(`Unexpected DeltaUSD deployment on ${network.chain}`);
  }
  const state = Object.fromEntries(
    UINT_FIELDS.map((name, i) => [name, asUint(values[i], name)])
  );
  if (
    state.DUSD_UNIT !== 10n ** 18n ||
    state.PRICE_SCALE !== 10n ** 18n ||
    state.USDT_UNIT !== 10n ** BigInt(network.collateralDecimals) ||
    state.APR_DENOMINATOR !== 10000n ||
    state.SECONDS_IN_YEAR !== 31536000n
  ) {
    throw new Error(`Unexpected DeltaUSD units on ${network.chain}`);
  }
  state.timestamp = asUint(header.timestamp, 'block timestamp');
  state.block = block;
  state.paused = paused;
  state.redeemQuote = asUint(redeemQuote, 'redemption quote');
  return state;
}

function holdingReturn(state) {
  const elapsed = state.timestamp - state.startTime;
  if (elapsed < 0n || state.basePrice === 0n || state.getCurrentPrice === 0n) {
    throw new Error('Invalid DeltaUSD price checkpoint');
  }
  const denominator = state.APR_DENOMINATOR * state.SECONDS_IN_YEAR;
  const priceAt = (seconds) => {
    const maxUint256 = (1n << 256n) - 1n;
    const numerator = state.basePrice * state.apr * seconds;
    const result = state.basePrice + numerator / denominator;
    if (numerator > maxUint256 || result > maxUint256) {
      throw new Error(
        'DeltaUSD price projection overflows the contract formula'
      );
    }
    return result;
  };
  const price = priceAt(elapsed);
  if (
    price !== state.getCurrentPrice ||
    state.redeemQuote !== (state.USDT_UNIT * price) / state.PRICE_SCALE
  ) {
    throw new Error('DeltaUSD price formula or redemption quote changed');
  }
  // The contract accrues linearly. Do not invent daily compounding or report
  // apr()/100 as the return on today's purchase price. This is the exact
  // 365-day holding return if the owner leaves the current checkpoint intact.
  const nextYearPrice = priceAt(elapsed + state.SECONDS_IN_YEAR);
  return positiveNumber(
    (Number(nextYearPrice - price) / Number(price)) * 100,
    'holding return',
    true
  );
}

async function reserveTvlUsd() {
  const { data } = await axios.get(RESERVE_TVL_URL, { timeout: 20000 });
  const latest = Array.isArray(data?.tvl) ? data.tvl.at(-1) : undefined;
  const now = Math.floor(Date.now() / 1000);
  if (
    String(data?.id) !== module.exports.protocolId ||
    !Number.isSafeInteger(latest?.date) ||
    latest.date > now + 300 ||
    now - latest.date > MAX_RESERVE_AGE
  ) {
    throw new Error('Missing or stale DeltaUSD reserve TVL');
  }
  // Reuse the existing on-chain reserve adapter's net TVL, across strategy chains.
  return positiveNumber(latest.totalLiquidityUSD, 'reserve TVL', true);
}

async function apy() {
  const [state, tvlUsd] = await Promise.all([
    readState(NETWORK),
    reserveTvlUsd(),
  ]);
  const apyBase = holdingReturn(state);
  const configuredApr = (
    (Number(state.apr) / Number(state.APR_DENOMINATOR)) * 100
  ).toFixed(2);
  const waitDays = Number((Number(state.holdPeriod) / 86400).toFixed(2));
  return [
    {
      pool: `${NETWORK.token}-${NETWORK.chain}`,
      chain: NETWORK.name,
      project: PROJECT,
      symbol: 'dUSD',
      token: NETWORK.token,
      underlyingTokens: [NETWORK.collateral],
      tvlUsd,
      apyBase,
      pricePerShare: positiveNumber(
        Number(state.getCurrentPrice) / Number(state.PRICE_SCALE),
        'price per share'
      ),
      poolMeta: `Owner-set APR ${configuredApr}%; ${waitDays}d redemption wait`,
      frozen: state.paused,
      url: URL,
    },
  ];
}

module.exports = {
  protocolId: '9420',
  timetravel: false,
  apy,
  url: URL,
};
