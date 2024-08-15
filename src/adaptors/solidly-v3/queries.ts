const sdk = require('@defillama/sdk');
const { gql, request } = require('graphql-request');
const axios = require('axios');
const ethers = require('ethers');
const ABI = require('./abi');

const ZERO = ethers.BigNumber.from(0);

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

module.exports.pool_state_changes = async (pool_id, block_start) => {
  let provider = new ethers.providers.JsonRpcProvider(
    process.env.ALCHEMY_CONNECTION_ETHEREUM,
    1
  );
  const contract = new ethers.Contract(pool_id, ABI, provider);
  const begin_fee = (
    await contract.functions.slot0({ blockTag: block_start })
  )[2];
  // const begin_liq = (
  //   await contract.functions.liquidity({ blockTag: block_start })
  // )[0];
  // console.log("begin liq", begin_liq);
  const swaps = await contract.queryFilter(
    contract.filters.Swap(),
    block_start
  );
  const fee_change = await contract.queryFilter(
    contract.filters.SetFee(),
    block_start
  );
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
  return (await axios.get(`https://coins.llama.fi/block/ethereum/${start_24h}`))
    .data.height;
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
      ...(await axios.get(`https://coins.llama.fi/prices/current/${x}`)).data
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
