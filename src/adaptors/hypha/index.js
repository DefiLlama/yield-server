// WINDING DOWN -- GoGoPool / Hypha operations end 2026-08-15: no new minipools
// and ggAVAX (stAVAX on their site) stops accruing yield, so apyBase decays to
// 0 while TVL lingers. Add { id: '3179', slug: 'hypha' } to src/utils/exclude.js
// on that date. Withdrawals stay open until their site shuts down 2026-12-31.
const utils = require('../utils');
const sdk = require('@defillama/sdk');

const GGAVAX_CONTRACT = '0xA25EaF2906FA1a3a13EdAc9B9657108Af7B703e3';
const WAVAX_CONTRACT = '0xB31f66AA3C1e785363F0875A1B74E27b85FD66c7';

const exchangeRate = async (block) => {
  const [totalAssets, totalSupply] = await Promise.all([
    sdk.api.abi.call({
      target: GGAVAX_CONTRACT,
      abi: 'uint256:totalAssets',
      chain: 'avax',
      block,
    }),
    sdk.api.abi.call({
      target: GGAVAX_CONTRACT,
      abi: 'erc20:totalSupply',
      chain: 'avax',
      block,
    }),
  ]);
  return {
    totalAssets: Number(totalAssets.output) / 1e18,
    rate: Number(totalAssets.output) / Number(totalSupply.output),
  };
};

const avaxPrice = async () => {
  const priceKey = `avax:${WAVAX_CONTRACT}`;
  const data = await utils.getPriceApiData(`/prices/current/${priceKey}`);
  return data.coins[priceKey]?.price;
};

const annualise = (rateNow, ratePrior, days) =>
  rateNow > ratePrior ? (Math.pow(rateNow / ratePrior, 365 / days) - 1) * 100 : 0;

const topLvl = async () => {
  const now = Math.floor(Date.now() / 1000);
  const [, block7d] = await utils.getBlocksByTime(
    [now, now - 7 * 86400],
    'avax'
  );

  const [current, prior7d, avaxUsd] = await Promise.all([
    exchangeRate(),
    exchangeRate(block7d),
    avaxPrice(),
  ]);

  return {
    pool: GGAVAX_CONTRACT,
    chain: 'Avalanche',
    project: 'hypha',
    symbol: 'ggAVAX',
    tvlUsd: current.totalAssets * avaxUsd,
    apyBase: annualise(current.rate, prior7d.rate, 7),
    pricePerShare: current.rate,
    underlyingTokens: [WAVAX_CONTRACT],
  };
};

const main = async () => {
  return [await topLvl()];
};

module.exports = {
  protocolId: '3179',
  timetravel: false,
  apy: main,
  url: 'https://www.gogopool.com',
};
