const { gql, request } = require('graphql-request');
const axios = require('axios');
const ethers = require('ethers');
const ABI = require('./abi');

const GRAPH = 'https://api.thegraph.com/subgraphs/name/solidlylabs/solidly-v3';
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

module.exports.pool_state_changes = async (pool_id, provider, block_start) => {
  const contract = new ethers.Contract(pool_id, ABI, provider);
  const begin_fee = (
    await contract.functions.slot0({ blockTag: block_start })
  )[2];
  const begin_liq = (
    await contract.functions.liquidity({ blockTag: block_start })
  )[0];
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
    begin_liq,
    state_changes,
  };
};

module.exports.block_24h_ago = async () => {
  const end_24h = Math.floor(Date.now() / 1000.0);
  const start_24h = end_24h - 3600 * 24;
  return (await axios.get(`https://coins.llama.fi/block/ethereum/${start_24h}`))
    .data.height;
};

// fetch all pools avb up to timestamp from subgraph
module.exports.fetch_pools = async () => {
  const end_24h = Math.floor(Date.now() / 1000.0);
  // const start_24h = end_24h - (3600 * 24);
  // console.log("start_24h end_24h", start_24h, end_24h);
  let holder = '<TIMESTAMP_NOW>';
  let res = await request(
    GRAPH,
    GET_POOLS.replace(holder, end_24h).replace(holder, end_24h)
  );
  let touched_tokens = res.pools.flatMap((x) => [x.token0.id, x.token1.id]);
  return {
    pools: res.pools,
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
