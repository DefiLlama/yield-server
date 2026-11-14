const sdk = require('@defillama/sdk');
const axios = require('axios');

const PROJECT = 'deltausd';
const URL = 'https://deltausd.com/protocol';
const NETWORKS = [
  {
    chain: 'bsc',
    name: 'Binance',
    token: '0x1851302297e318d658829fd94b89d5ae6528cb9e',
    collateral: '0x55d398326f99059ff775485246999027b3197955',
    collateralDecimals: 18,
    canonical: true,
  },
];
const UINT_FIELDS = [
  'apr',
  'basePrice',
  'startTime',
  'getCurrentPrice',
  'totalSupply',
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

function collateralPrice(coin, now) {
  if (
    !coin ||
    !Number.isFinite(coin.timestamp) ||
    Math.abs(now - coin.timestamp) > 6 * 3600 ||
    (coin.confidence !== undefined &&
      (!Number.isFinite(coin.confidence) ||
        coin.confidence < 0.5 ||
        coin.confidence > 1))
  ) {
    throw new Error('Missing, stale or low-confidence collateral USD price');
  }
  return positiveNumber(coin.price, 'collateral USD price');
}

async function apy() {
  const states = await Promise.all(NETWORKS.map(readState));
  const keys = NETWORKS.map(
    (network) => `${network.chain}:${network.collateral}`
  );
  // Only the USDT/USD quote is external. APR, supply, price/share, pauses and
  // redemption terms are read from the deployed contracts, never the website.
  const { data } = await axios.get(
    `https://coins.llama.fi/prices/current/${keys.join(',')}`,
    {
      timeout: 20000,
    }
  );
  const now = Math.floor(Date.now() / 1000);
  return NETWORKS.map((network, i) => {
    const state = states[i];
    const apyBase = holdingReturn(state);
    const usdPrice = collateralPrice(data.coins?.[keys[i]], now);
    // Yield-pool TVL values the locally issued dUSD at its contract redemption
    // quote. It is a formula-valued claim, NOT the separate reserve-wallet TVL.
    const collateralValue =
      (state.totalSupply * state.USDT_UNIT * state.getCurrentPrice) /
      (state.DUSD_UNIT * state.PRICE_SCALE);
    const tvlUsd = positiveNumber(
      (Number(collateralValue) / Number(state.USDT_UNIT)) * usdPrice,
      'TVL',
      true
    );
    const configuredApr =
      (Number(state.apr) / Number(state.APR_DENOMINATOR)) * 100;
    const waitDays = Number(state.holdPeriod) / 86400;
    return {
      pool: `${network.token}-${network.chain}`,
      chain: network.name,
      project: PROJECT,
      symbol: 'dUSD',
      token: network.token,
      underlyingTokens: [network.collateral],
      tvlUsd,
      apyBase,
      pricePerShare: positiveNumber(
        Number(state.getCurrentPrice) / Number(state.PRICE_SCALE),
        'price per share'
      ),
      poolMeta: `Owner-set APR ${configuredApr}%; linear accrual; ${waitDays}d redemption wait with no accrual; USDT liquidity required`,
      frozen: state.paused,
      isIntrinsicSource: network.canonical,
      url: URL,
    };
  });
}

module.exports = {
  // Registered DeltaUSD protocol id.
  protocolId: '9420',
  timetravel: false,
  apy,
  url: URL,
};
