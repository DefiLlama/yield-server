const sdk = require('@defillama/sdk');
const axios = require('axios');
const utils = require('../utils');

const CHAIN = 'ethereum';
const PROJECT = '3jane-lending';
const USDC = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';

const USD3 = '0x056B269Eb1f75477a8666ae8C7fE01b64dD55eCc';
const sUSD3 = '0xf689555121e529Ff0463e191F9Bd9d1E496164a7';
const waUSDC = '0xD4fa2D31b7968E448877f69A96DE69f5de8cD23E';
const MORPHO_CREDIT = '0xDe6e08ac208088cc62812Ba30608D852c6B0EcBc';
const MARKET_ID =
  '0xc2c3e4b656f4b82649c8adbe82b3284c85cc7dc57c6dc8df6ca3dad7d2740d75';

const SECONDS_PER_DAY = 86400;
const MARKET_ABI =
  'function market(bytes32) view returns (uint128 totalSupplyAssets, uint128 totalSupplyShares, uint128 totalBorrowAssets, uint128 totalBorrowShares, uint128 lastUpdate, uint128 fee)';
const CONVERT_ABI =
  'function convertToAssets(uint256 shares) view returns (uint256)';

const getBlock = async (timestamp) => {
  const res = await axios.get(
    `https://coins.llama.fi/block/${CHAIN}/${timestamp}`
  );
  return res.data.height;
};

const apy = async () => {
  const now = Math.floor(Date.now() / 1000);
  const block7d = await getBlock(now - 7 * SECONDS_PER_DAY);

  // --- TVL ---
  const [usd3TotalAssets, susd3TotalAssets, usd3Pps] = await Promise.all([
    sdk.api.abi.call({
      target: USD3,
      abi: 'function totalAssets() view returns (uint256)',
      chain: CHAIN,
    }),
    sdk.api.abi.call({
      target: sUSD3,
      abi: 'function totalAssets() view returns (uint256)',
      chain: CHAIN,
    }),
    sdk.api.abi.call({
      target: USD3,
      abi: 'function pricePerShare() view returns (uint256)',
      chain: CHAIN,
    }),
  ]);

  const usd3TvlUsd = Number(usd3TotalAssets.output) / 1e6;
  const susd3TvlUsd =
    (Number(susd3TotalAssets.output) / 1e6) *
    (Number(usd3Pps.output) / 1e6);

  // --- APY ---
  // USD3 APY = Aave supply rate (from waUSDC rate growth)
  // sUSD3 APY = (credit market supply rate + Aave rate) * leverage
  //   where leverage = USD3 TVL / sUSD3 TVL
  //   because 100% performance fee redirects all USD3 vault yield to sUSD3

  // Fetch waUSDC rates and MorphoCredit market data at current + 7d ago
  const [waRateNow, waRate7d, marketNow, market7d] = await Promise.all([
    sdk.api.abi.call({
      target: waUSDC,
      abi: CONVERT_ABI,
      params: [1e6],
      chain: CHAIN,
    }),
    sdk.api.abi.call({
      target: waUSDC,
      abi: CONVERT_ABI,
      params: [1e6],
      chain: CHAIN,
      block: block7d,
    }),
    sdk.api.abi.call({
      target: MORPHO_CREDIT,
      abi: MARKET_ABI,
      params: [MARKET_ID],
      chain: CHAIN,
    }),
    sdk.api.abi.call({
      target: MORPHO_CREDIT,
      abi: MARKET_ABI,
      params: [MARKET_ID],
      chain: CHAIN,
      block: block7d,
    }),
  ]);

  // Aave APY from waUSDC rate growth (7d)
  const aaveApy =
    Number(waRate7d.output) > 0
      ? (Math.pow(Number(waRateNow.output) / Number(waRate7d.output), 365 / 7) - 1) * 100
      : null;

  // MorphoCredit supply APY from supply share price growth (7d)
  // supply share price = totalSupplyAssets / totalSupplyShares
  const sppNow =
    Number(marketNow.output.totalSupplyAssets) /
    Number(marketNow.output.totalSupplyShares);
  const spp7d =
    Number(market7d.output.totalSupplyAssets) /
    Number(market7d.output.totalSupplyShares);
  const creditApy =
    spp7d > 0
      ? (Math.pow(sppNow / spp7d, 365 / 7) - 1) * 100
      : null;

  // sUSD3 gets ALL yield (Aave + credit) from USD3 vault via 100% performance fee
  // Levered by the ratio of USD3 TVL to sUSD3 TVL
  const leverage = susd3TvlUsd > 0 ? usd3TvlUsd / susd3TvlUsd : 0;
  const susd3Apy = ((creditApy || 0) + (aaveApy || 0)) * leverage;

  return [
    {
      pool: `${USD3}-${CHAIN}`.toLowerCase(),
      chain: utils.formatChain(CHAIN),
      project: PROJECT,
      symbol: 'USD3',
      tvlUsd: usd3TvlUsd,
      apyBase: aaveApy,
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
      underlyingTokens: [USD3],
      url: 'https://app.3jane.xyz/supply',
    },
  ].filter((p) => utils.keepFinite(p));
};

module.exports = {
  timetravel: false,
  apy,
  url: 'https://app.3jane.xyz/supply',
};
