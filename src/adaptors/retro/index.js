const utils = require('../utils');

const chain = 'Polygon';

const chainId = 137;

const oRetro = '0x3a29cab2e124919d14a6f735b6033a3aad2b260f';

const getPoolsData = async () => {
  const { data: pools = [] } = await utils.getData(
    'https://retro-backend.stabl.finance/api/v1/fusions'
  );

  const merklData = await utils.getData(
    `https://api.angle.money/v2/merkl?chainIds%5B%5D=${chainId}&AMMs%5B%5D=retro`
  );

  const { data: assets = [] } = await utils.getData(
    'https://retro-backend.stabl.finance/api/v1/assets'
  );

  return pools.map((pool) => {
    const token0 = assets?.find(
      (asset) =>
        asset?.address.toLowerCase() === pool.token0?.address.toLowerCase()
    );
    const token1 = assets?.find(
      (asset) =>
        asset?.address.toLowerCase() === pool.token1?.address.toLowerCase()
    );

    const tvl0 = token0 && token0.price * pool.token0.underlyingReserve;
    const tvl1 = token1 && token1.price * pool.token1.underlyingReserve;

    const tvl = (tvl0 || 0) + (tvl1 || 0);

    const merklPool = merklData[chainId].pools?.[pool.underlyingPool] ?? 0;

    return {
      pool: `${pool?.address}-polygon`,
      chain,
      project: 'retro',
      symbol: pool.symbol,
      tvlUsd: tvl,
      apyReward: merklPool?.meanAPR ?? 0,
      rewardTokens: [oRetro],
      underlyingTokens: [pool?.token0?.address, pool?.token1?.address],
      url: `https://app.retro.finance/liquidity/add?currencyA=${token0?.address}&currencyB=${token1?.address}&rangeType=automatic`,
    };
  });
};

module.exports = {
  timetravel: false,
  apy: getPoolsData,
  url: 'https://app.retro.finance/liquidity',
};
