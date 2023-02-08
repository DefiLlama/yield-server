const utils = require('../utils');

const CHAINS = {
  250: 'fantom',
  56: 'bsc',
  137: 'polygon',
  42161: 'arbitrum',
};

const getApy = async () => {
  const poolsApy = [];

  const data = await utils.getData(
    'https://stats.liquidbolt.finance/defillama-liquidbolt.json'
  );

  if (data !== undefined) {
    for (let lp of data.lps) {
      if (CHAINS[lp.chain_id] !== undefined) {
        poolsApy.push({
          pool: lp.lp_address,
          chain: utils.formatChain(CHAINS[lp.chain_id]),
          project: 'liquid-bolt',
          symbol: lp.name,
          tvlUsd: Number(lp.liquidity_in_usd),
          apyBase: lp.apy_base,
          underlyingTokens: [lp.token0, lp.token1],
          rewardTokens: [lp.token0, lp.token1],
        });
      }
    }
  }

  return poolsApy;
}

module.exports = {
  timetravel: false,
  apy: getApy,
  url: 'https://app.liquidbolt.finance/',
};
