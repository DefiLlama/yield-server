const sdk = require('@defillama/sdk');
const { gql, request } = require('graphql-request');
const axios = require('axios');
const ethers = require('ethers');
const ABI = require('./abi');
const { getPriceApiData } = require('../utils');

const ZERO = ethers.BigNumber.from(0);
const CHAIN = 'ethereum';
const SLOT0_ABI = ABI.find(
  (item) => item.type === 'function' && item.name === 'slot0'
);
const EVENTS = {
  Swap:
    'event Swap(address indexed sender, address indexed recipient, int256 amount0, int256 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick)',
  SetFee: 'event SetFee(uint24 feeOld, uint24 feeNew)',
};

const GRAPH = sdk.graph.modifyEndpoint('7StqFFqbxi3jcN5C9YxhRiTxQM8HA8XEHopsynqqxw3t');
module.exports.get_graph_url = () => GRAPH;

const GET_POOLS = gql`
  {
    pools(where: { sqrtPrice_gt: "0", liquidity_gt: "0" }) {
      id
      tick
      totalValueLockedToken0
      totalValueLockedToken1
      tickSpacing
      sqrtPrice
      liquidity
      token0 {
        id
      }
      token1 {
        id
      }
      lpSolidEmissions(where: {period_lte: <TIMESTAMP_NOW>}) {
        period
        amount
      }
      lpTokenIncentives(where: {periodStart_lte: <TIMESTAMP_NOW>}) {
        periodStart
        periodEnd
        amount
        token
      }
    }
  }
`;

const normalizeLog = (event, log) => ({
  ...log,
  event,
  logIndex: log.logIndex ?? log.index ?? log.log_index,
});

const normalizeSwapLog = (log) => {
  const normalized = normalizeLog('Swap', log);
  return {
    ...normalized,
    args: {
      ...normalized.args,
      amount0: ethers.BigNumber.from(normalized.args.amount0),
      amount1: ethers.BigNumber.from(normalized.args.amount1),
    },
  };
};

module.exports.pool_state_changes = async (pool_id, block_start, block_end) => {
  const { output: slot0 } = await sdk.api.abi.call({
    target: pool_id,
    abi: SLOT0_ABI,
    chain: CHAIN,
    block: block_start,
  });
  const begin_fee = ethers.BigNumber.from(slot0.fee ?? slot0[2]);
  const swaps = (
    await sdk.getEventLogs({
      target: pool_id,
      eventAbi: EVENTS.Swap,
      chain: CHAIN,
      fromBlock: block_start,
      toBlock: block_end,
    })
  ).map(normalizeSwapLog);
  const fee_change = (
    await sdk.getEventLogs({
      target: pool_id,
      eventAbi: EVENTS.SetFee,
      chain: CHAIN,
      fromBlock: block_start,
      toBlock: block_end,
    })
  ).map((log) => normalizeLog('SetFee', log));
  let state_changes = [...swaps, ...fee_change];
  // Sort the state_changes array
  state_changes.sort((a, b) => {
    // Compare by blockNumber first
    if (a.blockNumber < b.blockNumber) return -1;
    if (a.blockNumber > b.blockNumber) return 1;
    // If blockNumbers are the same, compare by logIndex
    if (a.logIndex < b.logIndex) return -1;
    if (a.logIndex > b.logIndex) return 1;
    return 0;
  });
  return {
    begin_fee,
    // begin_liq,
    state_changes,
  };
};

module.exports.block_24h_ago = async (now) => {
  const end_24h = now;
  const start_24h = end_24h - 3600 * 24;
  return (await getPriceApiData(`/block/ethereum/${start_24h}`)).height;
};

const SOLID = '0x777172d858dc1599914a1c4c6c9fc48c99a60990'.toLowerCase();

// wow js what a concept
function bn_to_float(v, decimals) {
  v = ethers.FixedNumber.from(v.toString());
  return v
    .divUnsafe(
      ethers.FixedNumber.from(ethers.BigNumber.from(10.0).pow(decimals))
    )
    .toUnsafeFloat();
}

module.exports.bn_to_float = bn_to_float;
module.exports.get_solid = () => SOLID;

// fetch all pools avb up to timestamp from subgraph
module.exports.fetch_pools = async (now) => {
  const end_24h = now;
  let week = 3600 * 24 * 7;
  const one_week_before = end_24h - week;
  const in_one_week = end_24h + week;
  // const start_24h = end_24h - (3600 * 24);
  // console.log("start_24h end_24h", start_24h, end_24h);
  let holder = '<TIMESTAMP_NOW>';
  let res = await request(
    GRAPH,
    GET_POOLS.replace(holder, end_24h).replace(holder, end_24h)
  );
  let touched_tokens = res.pools.flatMap((x) => [x.token0.id, x.token1.id]);
  // add SOLID due to solid emissions
  touched_tokens = [...touched_tokens, SOLID];
  return {
    pools: res.pools.map((x) => {
      // SOLID EMISSIONS
      let latest = x.lpSolidEmissions
        .map((x) => {
          x.period = parseInt(x.period);
          x.amount = ethers.BigNumber.from(x.amount);
          return x;
        })
        .filter((x) => x.period > one_week_before && x.period < in_one_week)
        .reduce(
          (max, current) => (current.period > max.period ? current : max),
          { period: 0, amount: ZERO }
        );
      x.solid_per_year = latest.amount.mul(ethers.BigNumber.from(52));

      // TOKEN EMISSIONS = BRIBES
      let now = end_24h; // for test: - 3600 * 24;
      latest = x.lpTokenIncentives
        .map((x) => {
          x.periodStart = parseInt(x.periodStart);
          x.periodEnd = parseInt(x.periodEnd);
          x.amount = ethers.BigNumber.from(x.amount);
          return x;
        })
        .filter((x) => x.periodStart < x.periodEnd)
        // start is smaller than now, end is bigger than now
        .filter((x) => x.periodStart < now && x.periodEnd > now);

      x.emissions_per_year = [];
      if (latest.length > 0) {
        for (let emission of latest) {
          // so that its available in prices
          touched_tokens.push(emission.token);
          x.emissions_per_year.push({
            ...emission,
            // there is an edgecase here if emissions are for longer than year and token has little decimals
            per_year: emission.amount
              .mul(ethers.BigNumber.from(3600 * 24 * 365))
              .div(
                ethers.BigNumber.from(emission.periodEnd - emission.periodStart)
              ),
          });
        }
      }

      return x;
    }),
    touched_tokens,
  };
};

// fetch all prices now .. yes it is inaccurate for past queries
module.exports.fetch_prices = async (token_addr) => {
  const set = new Set(token_addr.map((x) => x.toLowerCase()));
  token_addr = [...set];
  // ex: https://coins.llama.fi/prices/current/ethereum:0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2
  let idsSet = token_addr.map((x) => `ethereum:${x}`);
  const maxSize = 50;
  const pages = Math.ceil(idsSet.length / maxSize);
  let prices = {};
  let x = '';
  for (const p of [...Array(pages).keys()]) {
    x = idsSet
      .slice(p * maxSize, maxSize * (p + 1))
      .join(',')
      .replaceAll('/', '');
    prices = {
      ...prices,
      ...(await getPriceApiData(`/prices/current/${x}`))
        .coins,
    };
  }
  let res = {};

  Object.keys(prices).forEach((key) => {
    // remove eth chain prefix
    res[key.split(':')[1].toLowerCase()] = prices[key];
  });

  return res;
};
