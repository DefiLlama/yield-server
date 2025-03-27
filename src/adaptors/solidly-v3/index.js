const utils = require('../utils');
const {
  fetch_pools,
  fetch_prices,
  block_24h_ago,
  pool_state_changes,
  get_solid,
  bn_to_float,
  getPoolTicks,
  get_graph_url,
} = require('./queries.ts');
// const { EstimateActiveLiq } = require('./estimateActiveLiq.ts');
const sdk = require('@defillama/sdk');
const ethers = require('ethers');

const ZERO = ethers.BigNumber.from(0);

// - All pools (subgraph) [X]
// - Solid Emissions per pool (subgraph) [X]
// - lp token incentives per pool (subgraph) [X]
// - prices of tokens in usd (the defilama api call) [X]
// - Fee change events for pools (on chain call) [X]
// - Swap events for pools (on chain call) [X]
//    - get fee of the pool at start of the period [X]
//    - get total fee for each token for period (accounted for pool fee changes) [X]
//    - get start liq of the pool for tvl [X]
//    - get how much token the active liq is worth [X] -> Use uniswap v3 adapter code
//          then active liq range can be inferred from swaps
//    - price the token liq and fee liq [X]
//    - get active token emissions [X]
//    - get active solidly emissions [X]
//
// - Balances of pools (range inferred from swap events and use total liquidity indexed by tick then added)

function pool_input(pool, x) {
  let price = Math.abs(
    ethers.FixedNumber.from(x.amount1.toString())
      .divUnsafe(ethers.FixedNumber.from(x.amount0.toString()))
      .toUnsafeFloat()
  );
  if (x.amount0 > ZERO) {
    return { token: pool.token0.id.toLowerCase(), input: x.amount0, price };
  } else {
    return { token: pool.token1.id.toLowerCase(), input: x.amount1, price };
  }
}

const main = async (timestamp = null) => {
  if (timestamp == null) {
    timestamp = Math.floor(Date.now() / 1000.0);
  }
  const block_start = await block_24h_ago(timestamp);
  let { pools, touched_tokens } = await fetch_pools(timestamp);
  let prices = await fetch_prices(touched_tokens);
  pools = pools
    .map((x) => {
      let t0 = x.token0.id.toLowerCase();
      let t1 = x.token1.id.toLowerCase();
      if (!(t0 in prices) || !(t1 in prices)) {
        return [];
      }
      x.t0 = prices[t0];
      x.t1 = prices[t1];
      x[t0] = prices[t0];
      x[t1] = prices[t1];
      x.t0_usd = parseFloat(x.totalValueLockedToken0) * x.t0.price;
      x.t1_usd = parseFloat(x.totalValueLockedToken1) * x.t1.price;
      x.tvl = x.t0_usd + x.t1_usd;
      return [x];
    })
    .flat();
  // console.log('pools lenght', pools.length);

  let data = (
    await Promise.all(
      pools.map(async (pool) => {
        let { begin_fee, state_changes, begin_liq } = await pool_state_changes(
          pool.id,
          block_start
        );
        let current_fee = begin_fee;
        let fee_per_token = {};

        fee_per_token[pool.token0.id.toLowerCase()] = ZERO;
        fee_per_token[pool.token1.id.toLowerCase()] = ZERO;

        let touched_prices = [];
        for (let s of state_changes) {
          // console.log(s);
          if (s.event == 'Swap') {
            // have to take fee from the positive amount
            let pool_in = pool_input(pool, s.args);
            touched_prices.push(pool_in.price);
            let swap_fee = pool_in.input
              .mul(current_fee)
              .div(ethers.BigNumber.from(1_000_000));

            fee_per_token[pool_in.token] =
              fee_per_token[pool_in.token].add(swap_fee);

            // console.log('got swap');
          } else if (s.event == 'SetFee') {
            current_fee = ethers.BigNumber.from(s.args.feeNew);
          }
        }

        let delta = 0.3;
        // get the more accurate delta using the prices from the swaps
        // if (touched_prices.length > 2) {
        //   let min = Math.min(...touched_prices);
        //   let max = Math.max(...touched_prices);
        //   delta = min / max;
        //   // console.log('NEW DELTA', pool.id, delta);
        // }
        let price_assumption = pool.t1.price / pool.t0.price;
        // pool.active_liq_fraction = await EstimateActiveLiq(
        //   pool.id,
        //   price_assumption,
        //   [price_assumption * (1 - delta), price_assumption * (1 + delta)],
        //   pool.t1.price,
        //   pool.t0.price,
        //   pool.tvl,
        //   pool.t0.decimals,
        //   pool.t1.decimals,
        //   get_graph_url()
        // );
        // console.log('ACTIVE LIQ', pool.id, delta, pool.active_liq_fraction);

        // reduce token fees to total fees in window
        let total_fee_usd = 0.0;
        for (let [k, v] of Object.entries(fee_per_token)) {
          let fee_usd = bn_to_float(v, pool[k].decimals) * pool[k].price;
          total_fee_usd += fee_usd;
        }
        pool.solid_per_year_usd =
          bn_to_float(pool.solid_per_year, 18) * prices[get_solid()].price;
        pool.rewardTokens = [];
        pool.apyReward = 0.0;
        if (pool.tvl != 0) {
          // the active tvl adjustment for apy
          // to undo just don't multiply by `active_liq_fraction`
          // pool.active_tvl = pool.tvl * pool.active_liq_fraction;
          pool.active_tvl = pool.tvl;
          // 20% goes to protocol
          pool.apyBase = (total_fee_usd / pool.active_tvl) * 365 * 100 * 0.8;
          pool.apySolid = (pool.solid_per_year_usd / pool.tvl) * 100;
          if (pool.apySolid != 0.0) {
            pool.apyReward = pool.apySolid;
            pool.rewardTokens.push(get_solid());
          }
          pool.apyEmissions = 0.0;
          for (let emission of pool.emissions_per_year) {
            if (emission.token in prices) {
              let token_obj = prices[emission.token];
              let per_year_usd =
                bn_to_float(emission.per_year, token_obj.decimals) *
                token_obj.price;
              pool.apyEmissions += (per_year_usd / pool.tvl) * 100;
              pool.rewardTokens.push(emission.token);
              pool.apyReward += pool.apyEmissions;
            }
          }
        }
        pool.symbol = `${pool.t0.symbol}-${pool.t1.symbol}`;
        // console.log(pool);
        return pool;
      })
    )
  ).map((pool) => {
    return {
      pool: pool.id,
      chain: 'ethereum',
      project: 'solidly-v3',
      symbol: pool.symbol,
      tvlUsd: pool.tvl,
      apyBase: pool.apyBase,
      apyReward: pool.apyReward,
      rewardTokens: [...new Set(pool.rewardTokens)],
      url: `https://solidly.com/liquidity/manage/${pool.id}/`,
      underlyingTokens: [pool.token0.id, pool.token1.id],
    };
  });
  // console.log(data);

  // throw '';
  // console.log(data);
  return data.flat().filter((p) => utils.keepFinite(p));
};

module.exports = {
  timetravel: false,
  apy: main,
};
