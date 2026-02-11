const axios = require('axios');
const utils = require('../utils');

const apy = async () => {
  const pools = await Promise.all(
    ['avalanche', 'arbitrum', 'monad'].map(async (chain) => {
      const apiUrl = `https://api.lfj.dev/v1/pools/${chain}?filterBy=1d&orderBy=volume&pageNum=1&pageSize=100&status=main&version=v2.2`;

      const pools = (
        await axios.get(apiUrl, {
          headers: {
            'x-traderjoe-api-key': process.env.TRADERJOE,
          },
        })
      ).data;

      return pools.map((p) => {
        return {
          pool: `${p.pairAddress}-${chain}`,
          chain: utils.formatChain(chain),
          project: 'joe-v2.2',
          symbol: p.name,
          underlyingTokens: [p.tokenX.address, p.tokenY.address],
          tvlUsd: p.liquidityUsd,
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
  apy,
  url: 'https://lfj.gg/avalanche/pool',
};
