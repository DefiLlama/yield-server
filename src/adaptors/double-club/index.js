const utils = require('../utils');
const URL = 'https://api.double.club/api/v1/getLPDetails';
const DDDX = '0x4B6ee8188d6Df169E1071a7c96929640D61f144f';
const DOU = '0x15330196e88a09637Bd2A8D206c7C85Fe99594D0';
const main = async () => {
  const { data } = await utils.getData(URL);
  const pools = data.filter((e) => e.DoubleTVL);

  return pools
    .map((pool) => {
      const apy =
        Number(pool.DoubleTVL.realdddxAPR || 0) +
        Number(pool.DoubleTVL.realdouAPR || 0);
      console.log(pool.symbol);
      return {
        pool: pool.poolAddress,
        chain: utils.formatChain('binance'),
        project: 'double-club',
        symbol: utils.formatSymbol(pool.symbol.split('-')[1]),
        tvlUsd: Number(pool.DoubleTVL.usdBalance),
        apy: apy,
        underlyingTokens: [pool.token0, pool.token1],
        rewardTokens: [DDDX, DOU],
      };
    })
    .filter((e) => e.tvlUsd !== 0)
    .filter((k) => k.apy !== 0);
};

module.exports = {
  timetravel: true,
  apy: main,
  url: 'https://double.club/',
};
