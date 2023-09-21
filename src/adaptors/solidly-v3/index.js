const utils = require('../utils');
const {
  fetch_pools,
  fetch_prices,
  block_24h_ago,
  pool_state_changes,
} = require('./queries.ts');
const sdk = require('@defillama/sdk');
const ethers = require('ethers');

// - All pools (subgraph) [X]
// - Solid Emissions per pool (subgraph) [X]
// - lp token incentives per pool (subgraph) [X]
// - prices of tokens in usd (the defilama api call) [X]
// - Fee change events for pools (on chain call) [X]
// - Swap events for pools (on chain call) [X]
//    - get fee of the pool at start of the period [X]
//    - get total fee for each token for period (accounted for pool fee changes) [X]
//    - get start liq of the pool for tvl [X]
//    - get how much token the active liq is worth [ ] -> can't without ticks in subgraph,
//          then active liq range can be inferred from swaps
//    - price the token liq and fee liq [X]
//    - get active token emissions [ ]
//    - get active solidly emissions [ ]
//
// - Balances of pools (range inferred from swap events and use total liquidity indexed by tick then added)

const ZERO = ethers.BigNumber.from(0);

function pool_input(pool, x) {
  if (x.amount0 > ZERO) {
    return { token: pool.token0.id.toLowerCase(), input: x.amount0 };
  } else {
    return { token: pool.token1.id.toLowerCase(), input: x.amount1 };
  }
}

const main = async (timestamp = null) => {
  const block_start = await block_24h_ago();
  let { pools, touched_tokens } = await fetch_pools();
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
  // console.log(pools);

  const provider = new ethers.providers.JsonRpcProvider(
    process.env.ALCHEMY_CONNECTION_ETHEREUM
  );
  let data = await Promise.all(
    pools.map(async (pool) => {
      let { begin_fee, state_changes, begin_liq } = await pool_state_changes(
        pool.id,
        provider,
        block_start
      );
      let max_liq_on_tick = begin_liq;
      let current_fee = begin_fee;
      let fee_per_token = {};

      fee_per_token[pool.token0.id.toLowerCase()] = ZERO;
      fee_per_token[pool.token1.id.toLowerCase()] = ZERO;

      for (let s of state_changes) {
        // console.log(s);
        if (s.event == 'Swap') {
          if (s.args.liquidity > max_liq_on_tick) {
            max_liq_on_tick = s.args.liquidity;
          }
          // have to take fee from the positive amount
          let pool_in = pool_input(pool, s.args);
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
      // reduce token fees to total fees in window
      let total_fee_usd = 0.0;
      for (let [k, v] of Object.entries(fee_per_token)) {
        // wow js what a concept
        v = ethers.FixedNumber.from(v.toString());
        let fee_usd =
          v
            .divUnsafe(
              ethers.FixedNumber.from(
                ethers.BigNumber.from(10.0).pow(pool[k].decimals)
              )
            )
            .toUnsafeFloat() * pool[k].price;
        total_fee_usd += fee_usd;
      }
      // console.log('total fees USD', pool.id, total_fee_usd);
      // console.log("fee per token",pool.id, fee_per_token);
      // console.log('tick to liq', pool.id, max_liq_on_tick.toString());
      // console.log('STATE CHANGES', pool.id, state_changes.length);
      // console.log('BEGIN FEE', pool.id, begin_fee);
      if (pool.tvl != 0) {
        pool.apyBase = (total_fee_usd / pool.tvl) * 365 * 100
      } else {
        pool.apyBase = 0.0
      } 
      pool.symbol = `${pool.t0.symbol}-${pool.t1.symbol}`
      // console.log(pool)
      return {
        pool: pool.id,
        chain: "ethereum",
        project: 'solidly-v3',
        symbol: pool.symbol,
        tvlUsd: pool.tvl,
        apyBase: pool.apyBase,
        // apyReward?: number;
        url: `https://solidly.com/liquidity/manage/${pool.id}/`,
        underlyingTokens: [pool.token0.id, pool.token1.id],
      };
    })
  );

  return data.flat().filter((p) => utils.keepFinite(p));
};

module.exports = {
  timetravel: false,
  apy: main,
};
