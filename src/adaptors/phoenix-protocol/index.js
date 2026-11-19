const sdk = require('@defillama/sdk');
const axios = require('axios');
const { getPriceApiUrl } = require('../utils');

const CHAIN = 'ethereum';
const PHLIMBO = '0x8D3A8E3ba43DEb8C7e2110DF437a92243523b6ca';
const PHUSD = '0xf3B5B661b92B75C71fA5Aba8Fd95D7514A9CD605';
const USDC = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';
const SUSDS = '0xa3931d71877C0E7a3148CB7Eb4463524FEc27fbD';
const UNIV2_PAIR = '0x0b96b8ab66d40ba3C7501aa8C28Cdc37688F6F7f';

const SECONDS_PER_YEAR = 31_536_000;

const callView = (target, abi, params) =>
  sdk.api.abi
    .call({ target, abi, params, chain: CHAIN })
    .then((r) => r.output);

const getPrices = async (tokens) => {
  const keys = tokens.map((t) => `${CHAIN}:${t}`);
  const { data } = await axios.get(
    getPriceApiUrl(`/prices/current/${keys.join(',')}`),
    { timeout: 10_000 }
  );
  return tokens.reduce((acc, t, i) => {
    const coin = data.coins[keys[i]];
    if (!coin) throw new Error(`missing DefiLlama price for ${keys[i]}`);
    acc[t.toLowerCase()] = coin.price;
    return acc;
  }, {});
};

// phUSD is not listed on the DefiLlama price API, so derive its USD value from
// the Uniswap V2 phUSD/sUSDS reserve ratio scaled by the DefiLlama sUSDS price
// (which already reflects the sUSDS->USDS ERC4626 rate and the USDS market price).
// Both tokens have 18 decimals, so the raw reserve ratio is the spot price.
const getPhUsdPrice = async (sUsdsPrice) => {
  const [token0, reserves] = await Promise.all([
    callView(UNIV2_PAIR, 'address:token0'),
    callView(
      UNIV2_PAIR,
      'function getReserves() view returns (uint112, uint112, uint32)'
    ),
  ]);

  const lc = (a) => String(a).toLowerCase();
  const susdsIsToken0 = lc(token0) === lc(SUSDS);
  if (!susdsIsToken0 && lc(token0) !== lc(PHUSD)) {
    throw new Error('phUSD/sUSDS not found in Uniswap V2 pair');
  }

  const sUsdsReserve = Number(reserves[susdsIsToken0 ? 0 : 1]);
  const phUsdReserve = Number(reserves[susdsIsToken0 ? 1 : 0]);
  if (!(sUsdsReserve > 0) || !(phUsdReserve > 0)) {
    throw new Error('Uniswap V2 pair has zero reserves');
  }

  return (sUsdsReserve / phUsdReserve) * sUsdsPrice;
};

const apy = async () => {
  const prices = await getPrices([SUSDS, USDC]);

  const [totalStaked, desiredAPYBps, rewardPerSecond, phUsdPrice] =
    await Promise.all([
      callView(PHLIMBO, 'uint256:totalStaked'),
      callView(PHLIMBO, 'uint256:desiredAPYBps'),
      callView(PHLIMBO, 'uint256:rewardPerSecond'),
      getPhUsdPrice(prices[SUSDS.toLowerCase()]),
    ]);

  const stakedAmount = Number(totalStaked) / 1e18;
  const tvlUsd = stakedAmount * phUsdPrice;

  let usdcApy = 0;
  if (tvlUsd > 0) {
    // rewardPerSecond is the live USDC emission rate: USDC (6 decimals) per
    // second, scaled by a further 1e18 of fixed-point precision (=> /1e24).
    const usdcPerYearUsd =
      (Number(rewardPerSecond) / 1e24) *
      SECONDS_PER_YEAR *
      prices[USDC.toLowerCase()];
    usdcApy = (usdcPerYearUsd / tvlUsd) * 100;
  }
  const phusdApy = Number(desiredAPYBps) / 100;
  const apyReward = usdcApy + phusdApy;

  return [
    {
      pool: `${PHLIMBO}-ethereum`.toLowerCase(),
      chain: 'Ethereum',
      project: 'phoenix-protocol',
      symbol: 'phUSD',
      tvlUsd,
      apyBase: null,
      apyReward,
      rewardTokens: [USDC, PHUSD],
      underlyingTokens: [PHUSD],
      poolMeta: 'Staking',
      url: 'https://phusd.behodler.io/staking',
    },
  ];
};

module.exports = {
  protocolId: '7703',
  timetravel: false,
  apy,
  url: 'https://phusd.behodler.io/staking',
};
