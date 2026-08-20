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
    // updates once per ~7d (staleness period 169h)
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

// elapsed time between oracle updates rounded to whole days
const elapsedWholeDaysSeconds = (startTimestamp, endTimestamp) =>
  Math.floor(
    (endTimestamp - startTimestamp + DAY_IN_SECONDS / 2) / DAY_IN_SECONDS
  ) * DAY_IN_SECONDS;

// compounded annualized rate: (endRate / startRate) ^ (year / elapsed) - 1
// null when not calculable (e.g. the oracle's first update has no predecessor)
const calcApyPct = (startRate, endRate, startTimestamp, endTimestamp) => {
  const elapsed = elapsedWholeDaysSeconds(startTimestamp, endTimestamp);
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

  // sample just before the latest update landed; the oracle then reports the
  // previous update, so the apy window is always exactly one publish interval
  const [blockBeforeUpdate] = await utils.getBlocksByTime(
    [endPrice.timestamp - 600],
    CHAIN
  );
  const startPrice = await getLastPrice(priceOracle, blockBeforeUpdate).catch(
    () => ({ value: 0n, timestamp: 0 })
  );

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
    project: 'vault-street-primeusd',
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

  const pools = await Promise.all(
    PRODUCTS.map((product) => getPool(product, usdcPriceUsd))
  );
  return pools.filter(Boolean);
};

module.exports = {
  timetravel: false,
  protocolId: '8176',
  apy,
  url: 'https://www.vaultstreet.com/',
};
