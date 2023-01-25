const utils = require('../utils');

const getUrl = (chain) =>
  `https://api.ib.xyz/api/v1/itoken?comptroller=${chain}`;

const CHAINS = {
  eth: 'ethereum',
  fantom: 'fantom',
  avalanche: 'avalanche',
  optimism: 'optimism',
};

const getApy = async () => {
  const vaultsData = await Promise.all(
    Object.keys(CHAINS).map(async (chain) => ({
      chain: CHAINS[chain],
      data: await utils.getData(getUrl(chain)),
    }))
  );

  const pools = vaultsData.map((chainData) => {
    const chainPools = chainData.data.map((pool) => {
      const tvlUsd =
        Number(pool.cash.value) * Number(pool.underlying_price.value);
      const totalBorrowUsd =
        Number(pool.total_borrows.value) * Number(pool.underlying_price.value);
      const totalSupplyUsd = totalBorrowUsd + tvlUsd;

      return {
        pool: `${pool.token_address}-${chainData.chain}`,
        chain: utils.formatChain(chainData.chain),
        project: 'iron-bank',
        symbol: pool.underlying_symbol,
        tvlUsd,
        apyBase: Number(pool.supply_apy.value) * 100,
        underlyingTokens: [pool.underlying_address],
        // borrow fields
        totalSupplyUsd,
        totalBorrowUsd,
        apyBaseBorrow: Number(pool.borrow_apy.value) * 100,
        ltv: Number(pool.collateral_factor.value),
      };
    });
    return chainPools;
  });

  return pools.flat();
};

module.exports = {
  timetravel: false,
  apy: getApy,
  url: 'https://app.ib.xyz/',
};
