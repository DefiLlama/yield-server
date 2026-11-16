const axios = require('axios');
const sdk = require('@defillama/sdk');
const utils = require('../utils');

// lfj's liquidityUsd values a token coins.llama.fi can't price at lfj's own
// price, so a pair holding 33k LCPEDU and 2.28 USDT reports $7.4M
// (2026-11-16). an unpriced side takes the pool's price, capped at the priced
// side, as in uniswap-v4. never above lfj's
const tvlUsd = (p, prices, reserves, activeId) => {
  const priceOf = (token) => {
    const price = prices[token.address.toLowerCase()]?.price;
    return price > 0 ? price : undefined;
  };
  const priceX = priceOf(p.tokenX);
  const priceY = priceOf(p.tokenY);
  if ((priceX === undefined) === (priceY === undefined)) return p.liquidityUsd;
  if (!reserves || activeId === undefined) return p.liquidityUsd;
  const reserveX = reserves[0] / 10 ** p.tokenX.decimals;
  const reserveY = reserves[1] / 10 ** p.tokenY.decimals;
  const tokenYPerTokenX =
    (1 + p.lbBinStep / 1e4) ** (activeId - 2 ** 23) *
    10 ** (p.tokenX.decimals - p.tokenY.decimals);
  const [priced, unpriced] =
    priceX === undefined
      ? [reserveY * priceY, reserveX * tokenYPerTokenX * priceY]
      : [reserveX * priceX, (reserveY / tokenYPerTokenX) * priceX];
  // no usable pool price: the priced side alone
  const tvl =
    tokenYPerTokenX > 0 && Number.isFinite(tokenYPerTokenX)
      ? priced + Math.min(unpriced, priced)
      : priced;
  return Number.isFinite(tvl) ? Math.min(p.liquidityUsd, tvl) : p.liquidityUsd;
};

const apy = async () => {
  const pools = await Promise.all(
    ['avalanche'].map(async (chain) => {
      const apiUrl = `https://api.lfj.dev/v1/pools/${chain}?filterBy=1d&orderBy=volume&pageNum=1&pageSize=100&status=main&version=v2.2`;

      const pools = (
        await axios.get(apiUrl, {
          headers: {
            'x-traderjoe-api-key': process.env.TRADERJOE,
          },
        })
      ).data;

      const llamaChain = chain === 'avalanche' ? 'avax' : chain;
      const tokens = [
        ...new Set(
          pools
            .flatMap((p) => [p.tokenX, p.tokenY])
            .map((t) => t.address.toLowerCase())
        ),
      ];
      const coins = await utils.getPriceApiCoins(
        tokens.map((t) => `${llamaChain}:${t}`)
      );
      const prices = Object.fromEntries(
        tokens.map((t) => [t, coins[`${llamaChain}:${t}`]])
      );
      const calls = pools.map((p) => ({ target: p.pairAddress }));
      const [reserves, activeIds] = await Promise.all(
        [
          'function getReserves() view returns (uint128 reserveX, uint128 reserveY)',
          'function getActiveId() view returns (uint24)',
        ].map(
          async (abi) =>
            (
              await sdk.api.abi.multiCall({
                chain: llamaChain,
                abi,
                calls,
                permitFailure: true,
              })
            ).output
        )
      );

      return pools.map((p, i) => {
        return {
          pool: `${p.pairAddress}-${chain}`,
          chain: utils.formatChain(chain),
          project: 'joe-v2.2',
          symbol: p.name,
          underlyingTokens: [p.tokenX.address, p.tokenY.address],
          tvlUsd: tvlUsd(
            p,
            prices,
            reserves[i].output,
            activeIds[i].output ?? undefined
          ),
          apyBase: ((p.feesUsd * 365) / p.liquidityUsd) * 100,
          volumeUsd1d: p.volumeUsd,
          url: `https://lfj.gg/${chain}/pool/v22/${p.tokenX.address}/${p.tokenY.address}/${p.lbBinStep}`,
        };
      });
    })
  );

  const result = pools.flat().filter((p) => utils.keepFinite(p));

  return result;
};

module.exports = {
  protocolId: '4794',
  apy,
  url: 'https://lfj.gg/avalanche/pool',
};
