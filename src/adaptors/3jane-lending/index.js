const sdk = require('@defillama/sdk');
const axios = require('axios');
const utils = require('../utils');

const CHAIN = 'ethereum';
const PROJECT = '3jane-lending';
const USDC = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';

const USD3 = '0x056B269Eb1f75477a8666ae8C7fE01b64dD55eCc';
const sUSD3 = '0xf689555121e529Ff0463e191F9Bd9d1E496164a7';

const SECONDS_PER_DAY = 86400;
const WINDOW_DAYS = 7;
const PPS_ABI = 'function pricePerShare() view returns (uint256)';
const TOTAL_ASSETS_ABI = 'function totalAssets() view returns (uint256)';

const getBlock = async (timestamp) => {
  const res = await axios.get(
    utils.getPriceApiUrl(`/block/${CHAIN}/${timestamp}`)
  );
  return res.data.height;
};

const getUsdcPrice = async () => {
  const key = `${CHAIN}:${USDC.toLowerCase()}`;
  const data = await utils.getPriceApiData(`/prices/current/${key}`);
  return data?.coins?.[key]?.price ?? 1;
};

const annualize = (now, then, days) =>
  Number.isFinite(now) && Number.isFinite(then) && then > 0
    ? (Math.pow(now / then, 365 / days) - 1) * 100
    : null;

const apy = async () => {
  const now = Math.floor(Date.now() / 1000);
  const blockPast = await getBlock(now - WINDOW_DAYS * SECONDS_PER_DAY);

  const call = (target, abi, block) =>
    sdk.api.abi
      .call({ target, abi, chain: CHAIN, block })
      .then((r) => Number(r.output));

  const [
    usd3PpsNow,
    susd3PpsNow,
    usd3TotalAssets,
    susd3TotalAssets,
    usd3PpsPast,
    susd3PpsPast,
    usdcPrice,
  ] = await Promise.all([
    call(USD3, PPS_ABI),
    call(sUSD3, PPS_ABI),
    call(USD3, TOTAL_ASSETS_ABI),
    call(sUSD3, TOTAL_ASSETS_ABI),
    call(USD3, PPS_ABI, blockPast),
    call(sUSD3, PPS_ABI, blockPast),
    getUsdcPrice(),
  ]);

  // USD3 (ERC4626 over USDC): realized yield = pricePerShare growth.
  const usd3Apy = annualize(usd3PpsNow, usd3PpsPast, WINDOW_DAYS);

  // sUSD3 (ERC4626 over USD3): a holder earns the staking boost (sUSD3->USD3
  // rate growth) AND the underlying USD3 appreciation (USD3->USDC growth), so
  // the USD yield compounds both rates.
  const susd3Apy = annualize(
    susd3PpsNow * usd3PpsNow,
    susd3PpsPast * usd3PpsPast,
    WINDOW_DAYS
  );

  // sUSD3 holds USD3 (valued in USDC via USD3's pricePerShare). That USD3 is
  // already part of USD3's totalAssets, so exclude the staked portion from the
  // USD3 pool to avoid double-counting it across both pools.
  const susd3Usdc = (susd3TotalAssets / 1e6) * (usd3PpsNow / 1e6);
  const susd3TvlUsd = susd3Usdc * usdcPrice;
  const usd3TvlUsd = (usd3TotalAssets / 1e6 - susd3Usdc) * usdcPrice;

  return [
    {
      pool: `${USD3}-${CHAIN}`.toLowerCase(),
      chain: utils.formatChain(CHAIN),
      project: PROJECT,
      symbol: 'USD3',
      tvlUsd: usd3TvlUsd,
      apyBase: usd3Apy,
      pricePerShare: usd3PpsNow / 1e6,
      underlyingTokens: [USDC],
      url: 'https://app.3jane.xyz/supply',
    },
    {
      pool: `${sUSD3}-${CHAIN}`.toLowerCase(),
      chain: utils.formatChain(CHAIN),
      project: PROJECT,
      symbol: 'sUSD3',
      tvlUsd: susd3TvlUsd,
      apyBase: susd3Apy,
      pricePerShare: susd3PpsNow / 1e6,
      underlyingTokens: [USD3],
      url: 'https://app.3jane.xyz/supply',
    },
  ].filter((p) => utils.keepFinite(p));
};

module.exports = {
  protocolId: '6659',
  timetravel: false,
  apy,
  url: 'https://app.3jane.xyz/supply',
};
