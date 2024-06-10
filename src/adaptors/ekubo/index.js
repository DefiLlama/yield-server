const utils = require('../utils');

const API_URL = 'https://mainnet-api.ekubo.org';

function getPrice({
  t,
  pricesUSDC,
  pricesETH,
  pricesSTRK,
  priceOfEth,
  priceOfStrk,
}) {
  let p = pricesUSDC.prices.find(({ token }) => BigInt(token) === t);
  if (p) return Number(p.price);
  p = pricesETH.prices.find(({ token }) => BigInt(token) === t);
  if (p && priceOfEth) {
    return Number(p.price) * Number(priceOfEth.price);
  }
  p = pricesSTRK.prices.find(({ token }) => BigInt(token) === t);
  if (p && priceOfStrk) {
    return Number(p.price) * Number(priceOfStrk);
  }
}

async function apy() {
  const [
    tokens,
    defiSpringData,
    pairData,
    pricesETH,
    pricesSTRK,
    pricesUSDC,
    priceOfEth,
    priceOfStrk,
  ] = await Promise.all([
    utils.getData(`${API_URL}/tokens`),
    utils.getData(`${API_URL}/defi-spring-incentives`),
    utils.getData(`${API_URL}/overview/pairs`),
    utils.getData(`${API_URL}/price/ETH?period=21600`),
    utils.getData(`${API_URL}/price/STRK?period=21600`),
    utils.getData(`${API_URL}/price/USDC?period=21600`),
    utils.getData(`${API_URL}/price/STRK/USDC?period=21600`),
    utils.getData(`${API_URL}/price/ETH/USDC?period=21600`),
  ]);

  const strkToken = tokens.find((t) => t.symbol === 'STRK');

  return pairData.topPairs
    .map((p) => {
      const t0 = BigInt(p.token0);
      const t1 = BigInt(p.token1);
      const token0 = tokens.find((t) => BigInt(t.l2_token_address) === t0);
      if (!token0 || token0.hidden) return;
      const token1 = tokens.find((t) => BigInt(t.l2_token_address) === t1);
      if (!token1 || token1.hidden) return;

      const springPair = defiSpringData.pairs.find(
        (pair) =>
          BigInt(pair.token0.l2_token_address) === t0 &&
          BigInt(pair.token1.l2_token_address) === t1
      );

      const price0 =
        token0.symbol === 'USDC'
          ? 1
          : getPrice({
              t: t0,
              pricesETH,
              pricesUSDC,
              pricesSTRK,
              priceOfEth,
              priceOfStrk,
            });
      const price1 =
        token1.symbol === 'USDC'
          ? 1
          : getPrice({
              t: t1,
              pricesETH,
              pricesUSDC,
              pricesSTRK,
              priceOfEth,
              priceOfStrk,
            });
      const tvlUsd =
        ((price0 ?? 0) * Number(p.tvl0_total)) / Math.pow(10, token0.decimals) +
        ((price1 ?? 0) * Number(p.tvl1_total)) / Math.pow(10, token1.decimals);

      if (tvlUsd < 10000) return;
      const feesUsd =
        ((price0 ?? 0) * Number(p.fees0_24h)) / Math.pow(10, token0.decimals) +
        ((price1 ?? 0) * Number(p.fees1_24h)) / Math.pow(10, token1.decimals);

      const apyBase = (feesUsd * 100 * 365) / tvlUsd;
      const apyReward = springPair ? springPair.currentApr * 100 : undefined;

      return {
        pool: `ekubo-${token0.symbol}-${token1.symbol}`,
        chain: 'Starknet',
        project: 'ekubo',
        symbol: `${token0.symbol}-${token1.symbol}`,
        rewardTokens: apyReward ? [strkToken.l2_token_address] : [],
        underlyingTokens: [token0.l2_token_address, token1.l2_token_address],
        tvlUsd,
        apyBase,
        apyReward,
      };
    })
    .filter((p) => !!p)
    .sort((a, b) => b.tvlUsd - a.tvlUsd);
}

module.exports = {
  timetravel: false,
  apy,
  url: 'https://app.ekubo.org/charts',
};
