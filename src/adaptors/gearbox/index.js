const sdk = require('@defillama/sdk');

const utils = require('../utils');
const { abi } = require('./abi');

const API_URL = 'https://mainnet.gearbox-api.com/api/pools';

const apy = async () => {
  const { data } = await utils.getData(API_URL);

  const underlyingTokens = await Promise.all(
    data.map(
      async ({ addr }) =>
        (
          await sdk.api.abi.call({
            target: addr,
            abi: abi.find(({ name }) => name === 'underlyingToken'),
            chain: 'ethereum',
          })
        ).output
    )
  );
  const symbols = await Promise.all(
    underlyingTokens.map(
      async (address) =>
        (
          await sdk.api.abi.call({
            target: address,
            abi: 'erc20:symbol',
            chain: 'ethereum',
          })
        ).output
    )
  );

  const pools = data.map((pool, i) => {
    return {
      pool: pool.addr,
      chain: utils.formatChain('ethereum'),
      project: 'gearbox',
      symbol: symbols[i],
      tvlUsd: pool.availableLiquidityInUSD,
      apyBase: (pool.depositAPY_RAY / 1e27) * 100,
      underlyingTokens: [underlyingTokens[i]],
    };
  });

  return pools;
};

module.exports = {
  apy,
  timetravel: false,
  url: 'https://app.gearbox.fi/pools',
};
