const axios = require('axios');
const utils = require('../utils');

const apy = async () => {
  const pools = await Promise.all(
    ['avalanche', 'arbitrum', 'binance'].map(async (chain) => {
      const apiUrl = `https://barn.traderjoexyz.com/v1/pools/${chain}?filterBy=1d&orderBy=volume&pageNum=1&pageSize=25&status=main`;

      const pools = (await axios.get(apiUrl)).data;

      return pools.map((p) => {
        return {
          pool: `${p.pairAddress}-${chain}`,
          chain: utils.formatChain(chain),
          project: 'joe-v2.1',
          symbol: p.name,
          underlyingTokens: [p.tokenX.address, p.tokenY.address],
          tvlUsd: p.liquidityUsd,
          apyBase: ((p.feesUsd * 365) / p.liquidityUsd) * 100,
          volumeUsd1d: p.volumeUsd,
        };
      });
    })
  );

  return pools.flat();
};

module.exports = {
  apy,
  url: 'https://traderjoexyz.com/avalanche/pool',
};
