const sdk = require('@defillama/sdk');
const utils = require('../utils');

const SECONDS_PER_MINUTE = 60;
const MINUTES_PER_HOUR = 60;
const HOURS_PER_DAY = 24;
const SECONDS_PER_HOUR = SECONDS_PER_MINUTE * MINUTES_PER_HOUR;
const SECONDS_PER_DAY = SECONDS_PER_HOUR * HOURS_PER_DAY;
const DAYS_PER_YEAR = 365;
const APY_LOOKBACK_DAYS = 14; // Lookback for the ERC-4626 share-price delta

const MONTHS_PER_YEAR = 12;
const DAYS_PER_AVERAGE_YEAR = 365.25; // Includes the leap day, as dayjs does
const DAYS_PER_MONTH = DAYS_PER_AVERAGE_YEAR / MONTHS_PER_YEAR;
const TERM_FRACTIONS_PER_MONTH = 4; // Quarter-month precision, matching the Alchemix UI

const ABI = {
  convertToAssets: {
    inputs: [{ name: 'shares', type: 'uint256' }],
    name: 'convertToAssets',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  totalAssets: {
    inputs: [],
    name: 'totalAssets',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  totalActiveLocked: {
    inputs: [],
    name: 'totalActiveLocked',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  timeToTransmute: {
    inputs: [],
    name: 'timeToTransmute',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
};

// Blocks are the transmuter's unit of term length, so the seconds-per-block
// assumption is what converts a term into a maturity date. Arbitrum is 12s
// rather than ~0.25s because the contracts read block.number, which returns L1
// blocks there.
const SECONDS_PER_BLOCK = {
  ethereum: 12,
  arbitrum: 12,
  optimism: 2,
};

const DEPLOYMENTS = [
  {
    chain: 'ethereum',
    synthAsset: 'alETH',
    synth: '0x0100546F2cD4C9D97f798fFC9755E47865FF7Ee6',
    underlying: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
    underlyingSymbol: 'WETH',
    myt: '0x29bcfeD246ce37319d94eBa107db90C453D4c43D',
    transmuter: '0x073598132f37756a7E665FB52f1757463120bd3C',
  },
  {
    chain: 'ethereum',
    synthAsset: 'alUSD',
    synth: '0xBC6DA0FE9aD5f3b0d58160288917AA56653660E9',
    underlying: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
    underlyingSymbol: 'USDC',
    myt: '0x9B44efCa3e2a707B63Dc00CE79d646E5E5D24bA5',
    transmuter: '0x2584E8b0616b3E750492c9629a3b27679C410cb9',
  },
  {
    chain: 'arbitrum',
    synthAsset: 'alETH',
    synth: '0x17573150d67d820542EFb24210371545a4868B03',
    underlying: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1',
    underlyingSymbol: 'WETH',
    myt: '0xfe8F223F3d81462F55bf8609897B8cEcfA4B195C',
    transmuter: '0x2584E8b0616b3E750492c9629a3b27679C410cb9',
  },
  {
    chain: 'arbitrum',
    synthAsset: 'alUSD',
    synth: '0xCB8FA9a76b8e203D8C3797bF438d8FB81Ea3326A',
    underlying: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
    underlyingSymbol: 'USDC',
    myt: '0xEba62B842081CeF5a8184318Dc5C4E4aACa9f651',
    transmuter: '0x693b7594Ae0633d9c5574D0da46a040f92F5b281',
  },
  {
    chain: 'optimism',
    synthAsset: 'alETH',
    synth: '0x3E29D3A9316dAB217754d13b28646B76607c5f04',
    underlying: '0x4200000000000000000000000000000000000006',
    underlyingSymbol: 'WETH',
    myt: '0x91b8657aea26Caa8A0E9D6DD4E24727Ccf32F822',
    transmuter: '0x2584E8b0616b3E750492c9629a3b27679C410cb9',
  },
  {
    chain: 'optimism',
    synthAsset: 'alUSD',
    synth: '0xCB8FA9a76b8e203D8C3797bF438d8FB81Ea3326A',
    underlying: '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85',
    underlyingSymbol: 'USDC',
    myt: '0xAf510a560744880410f0f65e3341A020FBC2cA41',
    transmuter: '0x693b7594Ae0633d9c5574D0da46a040f92F5b281',
  },
];

const call = async (target, abi, chain, params = [], block = undefined) =>
  (await sdk.api.abi.call({ target, abi, chain, params, block })).output;

const getPrices = async (deployments) => {
  const keys = deployments
    .flatMap((d) => [`${d.chain}:${d.synth}`, `${d.chain}:${d.underlying}`])
    .join(',');
  const { coins } = await utils.getPriceApiData(`/prices/current/${keys}`);
  return coins;
};

// MYTs are ERC-4626, so realised yield is the growth in assets backing one
// share.
const getMytPool = async (deployment, prices, blocksBack) => {
  const priceKey = `${deployment.chain}:${deployment.underlying}`;
  const price = prices[priceKey];
  if (!price) return null;

  const oneShare = (10n ** 18n).toString();

  const [ppsNow, ppsThen, totalAssets] = await Promise.all([
    call(deployment.myt, ABI.convertToAssets, deployment.chain, [oneShare]),
    call(
      deployment.myt,
      ABI.convertToAssets,
      deployment.chain,
      [oneShare],
      blocksBack
    ),
    call(deployment.myt, ABI.totalAssets, deployment.chain),
  ]);

  if (!Number(ppsThen)) return null;

  const growth = Number(ppsNow) / Number(ppsThen);
  const apyBase =
    (growth ** (DAYS_PER_YEAR / APY_LOOKBACK_DAYS) - 1) * 100;

  const tvlUsd = (Number(totalAssets) / 10 ** price.decimals) * price.price;

  return {
    pool: `${deployment.myt}-${deployment.chain}`.toLowerCase(),
    chain: utils.formatChain(deployment.chain),
    project: 'alchemix-v3',
    symbol: utils.formatSymbol(deployment.underlyingSymbol),
    tvlUsd,
    apyBase: apyBase > 0 ? apyBase : 0,
    underlyingTokens: [deployment.underlying],
    token: deployment.myt,
    pricePerShare: Number(ppsNow) / 10 ** price.decimals,
    poolMeta: `Mixed Yield Token (${deployment.synthAsset} vault)`,
    url: 'https://alchemix.fi/mixed-yield',
  };
};

// The transmuter is a fixed-term product: alAssets redeem 1:1 for underlying at
// maturity, so the yield is the discount to par, annualised over the term. If
// the alAsset trades at or above par there is no yield on offer, so this floors
// at 0 rather than reporting a negative rate.
const getTransmuterPool = async (deployment, prices) => {
  const synthPrice = prices[`${deployment.chain}:${deployment.synth}`];
  const underlyingPrice = prices[`${deployment.chain}:${deployment.underlying}`];
  if (!synthPrice || !underlyingPrice || !synthPrice.price) return null;

  const [totalActiveLocked, timeToTransmute] = await Promise.all([
    call(deployment.transmuter, ABI.totalActiveLocked, deployment.chain),
    call(deployment.transmuter, ABI.timeToTransmute, deployment.chain),
  ]);

  const termSeconds =
    Number(timeToTransmute) * SECONDS_PER_BLOCK[deployment.chain];
  const termDays = termSeconds / SECONDS_PER_DAY;
  if (termDays <= 0) return null;

  const termMonths =
    Math.round((termDays / DAYS_PER_MONTH) * TERM_FRACTIONS_PER_MONTH) /
    TERM_FRACTIONS_PER_MONTH;

  // alAssets are par-valued against the underlying, so the underlying price is
  // the fair value the discount is measured against.
  const ratio = synthPrice.price / underlyingPrice.price;
  const returnAtMaturity = 1 / ratio - 1;
  const apyBase = returnAtMaturity * (DAYS_PER_YEAR / termDays) * 100;

  // alAssets are 18 decimals.
  const tvlUsd = (Number(totalActiveLocked) / 1e18) * synthPrice.price;

  return {
    pool: `${deployment.transmuter}-${deployment.chain}`.toLowerCase(),
    chain: utils.formatChain(deployment.chain),
    project: 'alchemix-v3',
    symbol: utils.formatSymbol(deployment.synthAsset),
    tvlUsd,
    apyBase: apyBase > 0 ? apyBase : 0,
    underlyingTokens: [deployment.underlying],
    // Transmuter positions are non-fungible, so there is no receipt token to
    // attribute holders to.
    token: null,
    poolMeta: `Fixed Yield: ${termMonths} month term`,
    url: 'https://alchemix.fi/fixed-yield',
  };
};

const apy = async () => {
  const prices = await getPrices(DEPLOYMENTS);

  const startingTimestamp =
    Math.floor(Date.now() / 1000) - APY_LOOKBACK_DAYS * SECONDS_PER_DAY;

  const chains = [...new Set(DEPLOYMENTS.map((d) => d.chain))];
  const blocksSinceStartingTimestamp = Object.fromEntries(
    await Promise.all(
      chains.map(async (chain) => [
        chain,
        (await utils.getBlocksByTime([startingTimestamp], chain))[0],
      ])
    )
  );

  const pools = await Promise.all(
    DEPLOYMENTS.flatMap((d) => [
      getMytPool(d, prices, blocksSinceStartingTimestamp[d.chain]),
      getTransmuterPool(d, prices),
    ])
  );

  return pools.filter((p) => p && Number.isFinite(p.tvlUsd));
};

module.exports = {
  protocolId: '7749',
  timetravel: false,
  apy,
  url: 'https://alchemix.fi',
};