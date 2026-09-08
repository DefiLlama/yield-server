const sdk = require('@defillama/sdk');
const utils = require('../utils');

const CHAIN = 'ethereum';

const USDC = '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48';

// oracle prices are scaled to 8 decimals (token/USDC)
const PRICE_DECIMALS = 8n;
const USDC_DECIMALS = 6n;
const LAST_PRICE_ABI =
  'function lastPrice() view returns (uint256 value, uint256 timestamp)';

const DAY_IN_SECONDS = 24 * 60 * 60;
const SECONDS_IN_YEAR = 365 * DAY_IN_SECONDS;
const MIN_WINDOW_DAYS = 7;

const PRODUCTS = [
  {
    symbol: 'primeUSD',
    token: '0x7ea76108975ec0998b9bc2db04b4eca986400dd7',
    priceOracle: '0x8cda03e2004c35e07963fb792c6b7511dabee369',
    url: 'https://app.vaultstreet.com/prime-usd',
  },
  {
    symbol: 'CARRY',
    token: '0xf05f7ab9b05d9dcf99b8e9bbae8e5e4a3201d004',
    priceOracle: '0xd610fabab31c6d76b50a49c337fc39d6559e0e87',
    url: 'https://app.vaultstreet.com/carry',
  },
];

const getLastPrice = async (priceOracle, block) => {
  const { output } = await sdk.api.abi.call({
    target: priceOracle,
    abi: LAST_PRICE_ABI,
    chain: CHAIN,
    ...(block ? { block } : {}),
  });
  return { value: BigInt(output.value), timestamp: Number(output.timestamp) };
};

// compounded annualized rate: (endRate / startRate) ^ (year / elapsed) - 1
// null when not calculable (e.g. the oracle's first update has no predecessor)
const calcApyPct = (startRate, endRate, startTimestamp, endTimestamp) => {
  const elapsed = endTimestamp - startTimestamp;
  if (!(startRate > 0) || elapsed <= 0) return null;
  return (
    (Math.pow(endRate / startRate, SECONDS_IN_YEAR / elapsed) - 1) * 100
  );
};

const getPool = async ({ symbol, token, priceOracle, url }, usdcPriceUsd) => {
  const [supplyRes, decimalsRes, endPrice] = await Promise.all([
    sdk.api.abi.call({ target: token, abi: 'erc20:totalSupply', chain: CHAIN }),
    sdk.api.abi.call({ target: token, abi: 'erc20:decimals', chain: CHAIN }),
    getLastPrice(priceOracle),
  ]);

  // anchor to the last publish at or before (latest - MIN_WINDOW), so the window
  // never collapses when the publisher goes off-schedule
  const [anchorBlock] = await utils.getBlocksByTime(
    [endPrice.timestamp - MIN_WINDOW_DAYS * DAY_IN_SECONDS],
    CHAIN
  );
  const startPrice = await getLastPrice(priceOracle, anchorBlock).catch((e) => {
    if (/revert/i.test(e?.message ?? '')) return { value: 0n, timestamp: 0 };
    throw e;
  });

  const supply = BigInt(supplyRes.output);
  const tokenDecimals = BigInt(decimalsRes.output);

  // value the token in USDC terms, then express the balance in USDC's own decimals
  const scale = 10n ** (tokenDecimals + PRICE_DECIMALS - USDC_DECIMALS);
  const usdcBalance = (supply * endPrice.value) / scale;
  const tvlUsd = (Number(usdcBalance) / 10 ** Number(USDC_DECIMALS)) * usdcPriceUsd;

  // token/USDC price per share (8 decimals) from the oracle
  const pricePerShare = Number(endPrice.value) / 10 ** Number(PRICE_DECIMALS);
  const startRate = Number(startPrice.value) / 10 ** Number(PRICE_DECIMALS);

  const apyBase = calcApyPct(
    startRate,
    pricePerShare,
    startPrice.timestamp,
    endPrice.timestamp
  );
  if (apyBase === null) return null;

  return {
    pool: `${token}-${CHAIN}`,
    chain: 'Ethereum', // display name; handler normalizes via formatChain
    project: 'vault-street',
    symbol,
    tvlUsd,
    apyBase,
    pricePerShare,
    underlyingTokens: [USDC],
    token,
    url,
  };
};

const apy = async () => {
  const usdcPrice = await utils.getPriceApiData(
    `/prices/current/${CHAIN}:${USDC}`
  );
  const usdcPriceUsd = usdcPrice.coins[`${CHAIN}:${USDC}`]?.price ?? 1;

  const settled = await Promise.allSettled(
    PRODUCTS.map((product) => getPool(product, usdcPriceUsd))
  );
  const failed = settled
    .map((r, i) =>
      r.status === 'rejected' ? `${PRODUCTS[i].symbol}: ${r.reason?.message}` : null
    )
    .filter(Boolean);
  if (failed.length)
    console.log(
      `vault-street: ${failed.length}/${PRODUCTS.length} products failed -> ${failed.join(' | ')}`
    );
  const pools = settled
    .filter((r) => r.status === 'fulfilled')
    .map((r) => r.value)
    .filter(Boolean);
  if (pools.length === 0)
    throw new Error(
      `vault-street: no valid product pool${failed.length ? ` -> ${failed.join(' | ')}` : ''}`
    );
  return pools;
};

module.exports = {
  timetravel: false,
  protocolId: '8176',
  apy,
  url: 'https://www.vaultstreet.com/',
};

