const sdk = require('@defillama/sdk');
const utils = require('../utils');

const CHAIN = 'ethereum';

const USDC = '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48';
const primeUSD = '0x7ea76108975ec0998b9bc2db04b4eca986400dd7';
const priceOracle = '0x8cda03e2004c35e07963fb792c6b7511dabee369';

// oracle price is scaled to 8 decimals (primeUSD/USDC)
const PRICE_DECIMALS = 8n;
const USDC_DECIMALS = 6n;
const LAST_PRICE_ABI =
  'function lastPrice() view returns (uint256 value, uint256 timestamp)';

const DAY_IN_SECONDS = 24 * 60 * 60;
const SECONDS_IN_YEAR = 365 * DAY_IN_SECONDS;

const getLastPrice = async (block) => {
  const { output } = await sdk.api.abi.call({
    target: priceOracle,
    abi: LAST_PRICE_ABI,
    chain: CHAIN,
    ...(block ? { block } : {}),
  });
  return { value: BigInt(output.value), timestamp: Number(output.timestamp) };
};

const apy = async () => {
  const currentBlock = await sdk.api.util.getLatestBlock(CHAIN);
  const timestamp7dAgo = currentBlock.timestamp - 7 * DAY_IN_SECONDS;
  const [block7dAgo] = await utils.getBlocksByTime([timestamp7dAgo], CHAIN);

  const [supplyRes, decimalsRes, endPrice, startPrice, usdcPrice] =
    await Promise.all([
      sdk.api.abi.call({ target: primeUSD, abi: 'erc20:totalSupply', chain: CHAIN }),
      sdk.api.abi.call({ target: primeUSD, abi: 'erc20:decimals', chain: CHAIN }),
      getLastPrice(),
      getLastPrice(block7dAgo),
      utils.getPriceApiData(`/prices/current/${CHAIN}:${USDC}`),
    ]);

  const supply = BigInt(supplyRes.output);
  const primeDecimals = BigInt(decimalsRes.output);
  const usdcPriceUsd = usdcPrice.coins[`${CHAIN}:${USDC}`]?.price ?? 1;

  // value primeUSD in USDC terms, then express the balance in USDC's own decimals
  const scale = 10n ** (primeDecimals + PRICE_DECIMALS - USDC_DECIMALS);
  const usdcBalance = (supply * endPrice.value) / scale;
  const tvlUsd = (Number(usdcBalance) / 10 ** Number(USDC_DECIMALS)) * usdcPriceUsd;

  // primeUSD/USDC price per share (8 decimals) from the oracle
  const pricePerShare = Number(endPrice.value) / 10 ** Number(PRICE_DECIMALS);
  const startRate = Number(startPrice.value) / 10 ** Number(PRICE_DECIMALS);


  const elapsedSeconds = endPrice.timestamp - startPrice.timestamp;
  const apyBase =
    startRate > 0 && elapsedSeconds > 0
      ? ((pricePerShare - startRate) / startRate) *
        (SECONDS_IN_YEAR / elapsedSeconds) *
        100
      : 0;

  return [
    {
      pool: `${primeUSD}-${CHAIN}`,
      chain: 'Ethereum', // display name; handler normalizes via formatChain
      project: 'vault-street-primeusd',
      symbol: 'primeUSD',
      tvlUsd,
      apyBase,
      pricePerShare,
      underlyingTokens: [USDC],
      token: primeUSD,
      url: 'https://app.vaultstreet.com/prime-usd'
    },
  ];
};

module.exports = {
  timetravel: false,
  protocolId: '8176',
  apy,
  url: 'https://www.vaultstreet.com/',
};
