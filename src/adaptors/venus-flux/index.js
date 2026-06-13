const axios = require('axios');
const sdk = require('@defillama/sdk');
const utils = require('../utils');

const LENDING_RESOLVER = '0x48D32f49aFeAEC7AE66ad7B9264f446fc11a1569';
const CHAIN = 'bsc';

const abiLendingResolver = require('../fluid-lending/abiLendingResolver');

const apy = async () => {
  const fTokensEntireData = (
    await sdk.api.abi.call({
      target: LENDING_RESOLVER,
      abi: abiLendingResolver.find((m) => m.name === 'getFTokensEntireData'),
      chain: CHAIN,
    })
  ).output;

  const underlying = fTokensEntireData.map((d) => d.asset);

  const [symbol, decimals] = await Promise.all([
    sdk.api.abi.multiCall({
      calls: underlying.map((t) => ({ target: t })),
      abi: 'erc20:symbol',
      chain: CHAIN,
    }),
    sdk.api.abi.multiCall({
      calls: underlying.map((t) => ({ target: t })),
      abi: 'erc20:decimals',
      chain: CHAIN,
    }),
  ]);

  const priceKeys = underlying.map((i) => `${CHAIN}:${i}`).join(',');
  const prices = (
    await axios.get(`https://coins.llama.fi/prices/current/${priceKeys}`)
  ).data.coins;

  return fTokensEntireData
    .map((token, i) => {
      const priceKey = `${CHAIN}:${underlying[i]}`;
      const price = prices[priceKey]?.price;
      if (!price) return null;

      const dec = decimals.output[i].output;
      const sym = symbol.output[i].output;

      return {
        pool: `${token.tokenAddress}-${CHAIN}`.toLowerCase(),
        chain: utils.formatChain(CHAIN),
        project: 'venus-flux',
        symbol: sym,
        tvlUsd: (token.totalAssets / 10 ** dec) * price,
        apyBase: Number((token.supplyRate / 1e2).toFixed(2)),
        apyReward: Number((token.rewardsRate / 1e12).toFixed(2)),
        underlyingTokens: [token.asset],
        rewardTokens: token.rewardsRate > 0 ? [token.asset] : [],
        url: `https://flux.venus.io/lending/56/${sym}`,
      };
    })
    .filter((i) => i !== null && utils.keepFinite(i));
};

module.exports = {
  timetravel: false,
  apy,
};
