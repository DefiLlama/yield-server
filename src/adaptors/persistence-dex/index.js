const superagent = require('superagent');
const { request, gql } = require('graphql-request');
const BigNumber = require('bignumber.js').default;

const utils = require('../utils');

const query = gql`
  {
    atom_price_data: price_data(
      limit: 1
      where: { asset_id: { _eq: "cosmos" } }
      order_by: { timestamp: desc }
    ) {
      price_usd
    }
    stkatom_price_data: price_data(
      limit: 1
      where: { asset_id: { _eq: "stkatom" } }
      order_by: { timestamp: desc }
    ) {
      price_usd
    }
    pools {
      poolId
      poolContractAddress
      poolAssets {
        identifier
        amount
      }
    }
    token_metadata {
      identifier
      ticker
    }
    pool_current_incentive_apr {
      pool_id
      incentive_apr
      reward_asset_id
    }
    pool_daily_aggregate {
      pool_id
      total_swap_fee
      total_volume
    }
    pool_weekly_aggregate_with_apr {
      pool_id
      apr
      current_liquidity_usd
      total_volume
    }
  }
`;

async function apy() {
  const data = await request(
    'https://api.core-1.dexter.zone/v1/graphql',
    query
  );
  const res = await superagent.get(
    'https://api.persistence.one/pstake/stkatom/apr'
  );
  const pstakeApr = Number(res.text) * 100;
  let stakingApr = 0;

  const pools = {};
  const tokenSymbolById = data.token_metadata.reduce((acc, token) => {
    acc[token.identifier] = token.ticker;
    return acc;
  }, {});

  data.pools.forEach((p) => {
    const tokenSymbol1 = tokenSymbolById[p.poolAssets[0].identifier];
    const tokenSymbol2 = tokenSymbolById[p.poolAssets[1].identifier];
    pools[p.poolId] = {
      pool: `dexter-pool-${p.poolId}-${tokenSymbol1}-${tokenSymbol2}`,
      chain: 'Persistence',
      project: 'persistence-dex',
      symbol: utils.formatSymbol(`${tokenSymbol1}-${tokenSymbol2}`),
      url: `https://app.dexter.zone/pools/${p.poolContractAddress}`,
      apyReward: 0,
      rewardTokens: [],
    };

    if (p.poolId === 1) {
      const atomsUsd = new BigNumber(p.poolAssets[0].amount).times(
        data.atom_price_data[0].price_usd
      );
      const stkAtomsUsd = new BigNumber(p.poolAssets[1].amount).times(
        data.stkatom_price_data[0].price_usd
      );
      const stkAtomsUsdRatio = stkAtomsUsd.div(atomsUsd.plus(stkAtomsUsd));
      stakingApr = stkAtomsUsdRatio.times(pstakeApr).toNumber();
    }
  });

  data.pool_current_incentive_apr.forEach((p) => {
    pools[p.pool_id].apyReward += p.incentive_apr;
    if (p.incentive_apr > 0) {
      const rewardSymbol = tokenSymbolById[p.reward_asset_id];
      pools[p.pool_id].rewardTokens.push(rewardSymbol);
    }
  });

  data.pool_weekly_aggregate_with_apr.forEach((p) => {
    pools[p.pool_id].apyBase7d = p.apr;
    pools[p.pool_id].volumeUsd7d = p.total_volume;
    pools[p.pool_id].tvlUsd = p.current_liquidity_usd;

    if (p.pool_id === 1) {
      pools[p.pool_id].apyBase7d += stakingApr;
    }
  });

  data.pool_daily_aggregate.forEach((p) => {
    const tvlUsd = pools[p.pool_id].tvlUsd;
    pools[p.pool_id].apyBase = ((p.total_swap_fee * 365) / tvlUsd) * 100;
    pools[p.pool_id].volumeUsd1d = p.total_volume;

    if (p.pool_id === 1) {
      pools[p.pool_id].apyBase += stakingApr;
    }
  });

  return Object.values(pools);
}

module.exports = {
  timetravel: false,
  apy,
  url: 'https://app.dexter.zone/pools',
};
