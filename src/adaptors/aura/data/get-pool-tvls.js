const { getTotalSupplies } = require('./rpc/erc20');
const utils = require('../../utils');

/**
 * Get TVL for Aura pools
 */
async function getPoolTvls(pools, chainName) {
  if (!pools?.length) return {};

  try {
    const [totalSupplyResults, tokenPrices] = await Promise.all([
      getTotalSupplies(
        pools.map((pool) => pool.token),
        chainName
      ),
      utils
        .getData(
          `https://coins.llama.fi/prices/current/${pools
            .map((pool) => `${chainName}:${pool.lptoken}`)
            .join(',')
            .toLowerCase()}`
        )
        .then((data) => data.coins),
    ]);

    return pools.reduce((acc, pool, index) => {
      const priceKey = `${chainName}:${pool.lptoken.toLowerCase()}`;
      const price = tokenPrices[priceKey]?.price;
      const totalSupply = totalSupplyResults[index]?.output;

      acc[pool.poolIndex] =
        price && totalSupply ? (Number(totalSupply) / 1e18) * price : 0;

      return acc;
    }, {});
  } catch {
    return {};
  }
}

module.exports = {
  getPoolTvls,
};
