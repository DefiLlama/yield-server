const fetch = require('node-fetch');

/*
export interface Market {
  id: string;
  name: string;
  api_base_url: string;
  documentation_url: string;
  chain: string;
  base_symbol: string;
  quote_symbol: string;
  collateral_token: {
    address: string;
    decimals: number;
  };
  debt_token: {
    address: string;
    decimals: number;
  };
  data_params: {
    weth: string;
    underlying_collateral_token: string;
    underlying_borrow_token: string;
    variable_pool: string;
    borrow_a_token_v1_5: string;
  };
  fee_config: {
    swap_fee_apr: number;
    fragmentation_fee: number;
    liquidation_reward_percent: number;
    overdue_collateral_protocol_percent: number;
    collateral_protocol_percent: number;
    fee_recipient: string;
  };
  risk_config: {
    cr_opening: number;
    cr_liquidation: number;
    minimum_credit_borrow_a_token: number;
    borrow_a_token_cap: number;
    min_tenor: number;
    max_tenor: number;
  };
  oracle_params: {
    price_feed: string;
    variable_pool_borrow_rate_stale_rate_interval: number;
  };
}

interface GetMarketsResponse {
  markets_by_chain: Record<string, Market[]>
}

interface GetTvlResponse {
  total_tvl_usd: number;
  collateral_tvl: number;
  collateral_tvl_usd: number;
  debt_tvl: number;
  debt_tvl_usd: number;
  total_borrow: number;
  total_borrow_usd: number;
}

interface GetBestRateResponse {
  tenors: number[];
  aprs: Array<number|string>;
  contributing_curves:
  {
    curve: {
      curve_relative_time_aprs: number[];
      curve_relative_time_market_rate_multipliers: number[];
      curve_relative_time_tenors: number[];
      id: string;
      block_number: number;
      block_timestamp: string;
      transaction_hash: string;
      transfer_from: string;
      max_due_date: number;
      user_address: string;
      depth: number;
    },
    apr: number;
    depth_used_borrow_token: number;
    depth_used_collateral_token: number;
  }[][]
}

interface GetMarketsLiquidityResponse {
  [market_id: string]: {
    total_liquidity_usd: number;
    sell_side_liquidity_usd: number;
    buy_side_liquidity_usd: number;
    sell_liquidity: number;
    buy_liquidity: number;
  };
}
*/

const ENDPOINT = 'https://api.rheo.xyz';

async function getMarkets() /*: Promise<Market[]>*/ {
  const getMarketsResponse /*: GetMarketsResponse*/ = await fetch(
    `${ENDPOINT}/`
  ).then((res) => res.json());
  return Object.values(getMarketsResponse.markets_by_chain).flat();
}

async function getMarketsLiquidity(
  market /*: Market*/
) /*: Promise<GetMarketsLiquidityResponse>*/ {
  const getMarketsLiquidityResponse /*: GetMarketsLiquidityResponse*/ =
    await fetch(`${ENDPOINT}/markets-liquidity`).then((res) => res.json());
  return getMarketsLiquidityResponse;
}

async function getTvl(market /*: Market*/) /*: Promise<GetTvlResponse>*/ {
  const getTvlResponse /*: GetTvlResponse*/ = await fetch(
    `${ENDPOINT}${market.api_base_url}/market-tvl`
  ).then((res) => res.json());
  return getTvlResponse;
}

async function lendingAPR(
  market /*: Market*/,
  tenor /*: number*/,
  depth /*: number*/
) /*: Promise<number|undefined>*/ {
  const getBestRateResponse /*: GetBestRateResponse*/ = await fetch(
    `${ENDPOINT}${market.api_base_url}/best-rate-for-tenors-scl/`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ tenors: [tenor], depth }),
    }
  ).then((res) => res.json());
  const apr18decimals = getBestRateResponse.aprs[0];
  if (typeof apr18decimals === 'string') {
    return undefined;
  }
  return apr18decimals / 1e16;
}

async function borrowingAPR(
  market /*: Market*/,
  tenor /*: number*/,
  depth /*: number*/
) /*: Promise<number|undefined>*/ {
  const getBestRateResponse /*: GetBestRateResponse*/ = await fetch(
    `${ENDPOINT}${market.api_base_url}/best-rate-for-tenors-bcl/`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ tenors: [tenor], depth }),
    }
  ).then((res) => res.json());
  const apr18decimals = getBestRateResponse.aprs[0];
  if (typeof apr18decimals === 'string') {
    return undefined;
  }
  return apr18decimals / 1e16;
}

module.exports = {
  getMarkets,
  getTvl,
  lendingAPR,
  borrowingAPR,
  getMarketsLiquidity,
};
