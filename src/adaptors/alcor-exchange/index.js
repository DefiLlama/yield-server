const axios = require('axios');
const utils = require('../utils');

// Alcor Exchange: concentrated liquidity AMM (swap.alcor) on Antelope chains.
// Pool reserves, fee tiers and farm incentives are read from the swap.alcor tables.
// 24h / 7d swap volume is not stored on chain, so it comes from Alcor's indexer.
//
// Only pools whose both tokens are on the list below are reported. It is the token
// list of the Alcor TVL adapter: assets DefiLlama prices through CoinGecko, bridged
// tokens backed 1:1 priced as their origin asset. Pools of other tokens are priced
// only by Alcor itself and are left out.

const CONTRACT = 'swap.alcor';
const MIN_TVL_USD = 500;
const SECONDS_PER_DAY = 86_400;

const CHAINS = {
  wax: {
    rpc: 'https://wax.greymass.com',
    api: 'https://wax.alcor.exchange',
    venue: 'wax',
    tokens: [
      ['eosio.token', 'WAX', 'wax'],
      ['alien.worlds', 'TLM', 'alien-worlds'],
      ['token.fusion', 'LSWAX', 'waxfusion-staked-wax'],
      ['wuffi', 'WUF', 'wuffi'],
      ['usdt.alcor', 'USDT', 'alcor-ibc-bridged-usdt-wax'],
      ['wrap.alcor', 'USDT', 'tether'],
      ['wrap.alcor', 'USDC', 'usd-coin'],
      ['wrap.alcor', 'ETH', 'ethereum'],
      ['wrap.alcor', 'BNB', 'binancecoin'],
      ['wrap.alcor', 'POL', 'polygon-ecosystem-token'],
      ['eth.token', 'WAXUSDC', 'usd-coin'],
      ['eth.token', 'WAXUSDT', 'tether'],
      ['eth.token', 'WAXWBTC', 'wrapped-bitcoin'],
      ['ibc.wt.eos', 'EOS', 'eos'],
      ['ibc.wt.tlos', 'TLOS', 'telos'],
    ],
  },
  proton: {
    rpc: 'https://proton.greymass.com',
    api: 'https://proton.alcor.exchange',
    venue: 'xpr',
    tokens: [
      ['eosio.token', 'XPR', 'proton'],
      ['xtokens', 'XUSDC', 'usd-coin'],
      ['xtokens', 'XUSDT', 'tether'],
      ['xtokens', 'XBTC', 'bitcoin'],
      ['xtokens', 'XETH', 'ethereum'],
      ['xtokens', 'XMT', 'metal'],
      ['xtokens', 'XXRP', 'ripple'],
      ['xtokens', 'XXLM', 'stellar'],
      ['xtokens', 'XPAX', 'paxos-standard'],
      ['xtokens', 'METAL', 'metal-blockchain'],
      ['xmd.token', 'XMD', 'metal-dollar'],
      ['loan.token', 'LOAN', 'proton-loan'],
    ],
  },
  eos: {
    rpc: 'https://mainnet.genereos.io',
    api: 'https://eos.alcor.exchange',
    venue: 'vaulta',
    tokens: [
      ['eosio.token', 'EOS', 'eos'],
      ['core.vaulta', 'A', 'vaulta'],
      ['tethertether', 'USDT', 'tether'],
      ['ibc.wt.wax', 'WAX', 'wax'],
    ],
  },
  telos: {
    rpc: 'https://telos.greymass.com',
    api: 'https://telos.alcor.exchange',
    venue: 'telos',
    tokens: [
      ['eosio.token', 'TLOS', 'telos'],
      ['wrap.alcor', 'USDT', 'tether'],
      ['wrap.alcor', 'USDC', 'usd-coin'],
      ['wrap.alcor', 'ETH', 'ethereum'],
      ['wrap.alcor', 'BNB', 'binancecoin'],
      ['wrap.alcor', 'POL', 'polygon-ecosystem-token'],
      ['wrap.alcor', 'WAX', 'wax'],
      ['ibc.wt.eos', 'EOS', 'eos'],
    ],
  },
};

const tokenKey = (contract, symbol) => `${contract}:${symbol}`;

const getAllRows = async (rpc, table) => {
  const rows = [];
  let lowerBound = '';

  while (true) {
    const { data } = await axios.post(`${rpc}/v1/chain/get_table_rows`, {
      code: CONTRACT,
      scope: CONTRACT,
      table,
      json: true,
      limit: 1000,
      lower_bound: lowerBound,
    });
    rows.push(...data.rows);
    if (!data.more) return rows;
    lowerBound = data.next_key;
  }
};

// "892140.41207816 WAX" → { amount: 892140.41207816, units: 89214041207816n, precision: 8, symbol: 'WAX' }
const parseAsset = (quantity) => {
  const [amount, symbol] = quantity.split(' ');
  const precision = amount.split('.')[1]?.length ?? 0;
  return {
    amount: Number(amount),
    units: BigInt(amount.replace('.', '')),
    precision,
    symbol,
  };
};

const bigIntSqrt = (n) => {
  if (n < 2n) return n;
  let x = n;
  let y = (x + 1n) / 2n;
  while (y < x) {
    x = y;
    y = (x + n / x) / 2n;
  }
  return x;
};

// Fees go to LPs except 1/feeProtocol of them, which goes to the protocol.
const lpFeeRate = ({ fee, feeProtocol }) =>
  (fee / 1e6) * (feeProtocol > 0 ? 1 - 1 / feeProtocol : 1);

// Incentive rewards are split by staking weight = sqrt(amountA * amountB) of each
// staked position, so the staked share of the pool is the total weight over the
// same measure of the pool reserves.
const rewardApr = (incentive, reserveA, reserveB, tvlUsd, rewardPrice) => {
  const poolWeight = bigIntSqrt(reserveA.units * reserveB.units);
  const stakedWeight = BigInt(incentive.totalStakingWeight);
  if (poolWeight === 0n || stakedWeight === 0n) return 0;

  const stakedShare = Math.min(Number(stakedWeight) / Number(poolWeight), 1);
  const { precision } = parseAsset(incentive.reward.quantity);
  const rewardPerDay =
    (Number(incentive.rewardRateE18) / 1e18) * SECONDS_PER_DAY / 10 ** precision;

  return ((rewardPerDay * rewardPrice * 365) / (tvlUsd * stakedShare)) * 100;
};

const getChainPools = async (chain, prices) => {
  const { rpc, api, venue, tokens } = CHAINS[chain];
  const geckoIds = new Map(
    tokens.map(([contract, symbol, geckoId]) => [tokenKey(contract, symbol), geckoId])
  );
  const priceOf = (contract, symbol) => {
    const geckoId = geckoIds.get(tokenKey(contract, symbol));
    return geckoId ? prices[`coingecko:${geckoId}`]?.price : undefined;
  };

  // Volume for every pool of the chain in one request: one request per pool runs
  // into the API's rate limit.
  const [pools, incentives, poolStats] = await Promise.all([
    getAllRows(rpc, 'pools'),
    getAllRows(rpc, 'incentives'),
    axios.get(`${api}/api/v2/swap/pools`).then(({ data }) => data),
  ]);
  const statsById = new Map(poolStats.map((stats) => [stats.id, stats]));

  const now = Date.now() / 1000;
  const activeIncentives = incentives.filter((i) => i.periodFinish > now);

  const results = [];

  for (const pool of pools) {
    if (!pool.active) continue;

    const reserveA = parseAsset(pool.tokenA.quantity);
    const reserveB = parseAsset(pool.tokenB.quantity);
    const priceA = priceOf(pool.tokenA.contract, reserveA.symbol);
    const priceB = priceOf(pool.tokenB.contract, reserveB.symbol);
    if (!priceA || !priceB) continue;

    const tvlUsd = reserveA.amount * priceA + reserveB.amount * priceB;
    if (tvlUsd < MIN_TVL_USD) continue;

    // A pool the indexer has no stats for is skipped rather than reported at 0% APY.
    const stats = statsById.get(pool.id);
    if (!stats) continue;

    // Each swap is counted in both tokens; the two USD values are averaged.
    const volumeUsd1d = (stats.volumeA24 * priceA + stats.volumeB24 * priceB) / 2;
    const volumeUsd7d = (stats.volumeAWeek * priceA + stats.volumeBWeek * priceB) / 2;
    const feeRate = lpFeeRate(pool);

    const rewards = activeIncentives
      .filter((i) => i.poolId === pool.id)
      .map((incentive) => {
        const { symbol } = parseAsset(incentive.reward.quantity);
        const contract = incentive.reward.contract;
        const geckoId = geckoIds.get(tokenKey(contract, symbol));
        const price = priceOf(contract, symbol);
        if (!price) return null;
        return {
          token: `coingecko:${geckoId}`,
          apr: rewardApr(incentive, reserveA, reserveB, tvlUsd, price),
        };
      })
      .filter((r) => r && r.apr > 0);

    const apyReward = rewards.reduce((sum, r) => sum + r.apr, 0);

    results.push({
      pool: `${CONTRACT}-${pool.id}-${chain}`,
      chain: utils.formatChain(chain),
      project: 'alcor-exchange',
      symbol: `${reserveA.symbol}-${reserveB.symbol}`,
      tvlUsd,
      apyBase: ((volumeUsd1d * feeRate * 365) / tvlUsd) * 100,
      apyBase7d: ((volumeUsd7d / 7) * feeRate * 365 / tvlUsd) * 100,
      apyReward: apyReward > 0 ? apyReward : null,
      rewardTokens: apyReward > 0 ? [...new Set(rewards.map((r) => r.token))] : undefined,
      underlyingTokens: [
        `coingecko:${geckoIds.get(tokenKey(pool.tokenA.contract, reserveA.symbol))}`,
        `coingecko:${geckoIds.get(tokenKey(pool.tokenB.contract, reserveB.symbol))}`,
      ],
      poolMeta: `${pool.fee / 1e4}%`,
      volumeUsd1d,
      volumeUsd7d,
      url: `https://alcor.exchange/v/${venue}/analytics/pools/${pool.id}`,
      token: null,
    });
  }

  return results;
};

const apy = async () => {
  const geckoIds = [
    ...new Set(
      Object.values(CHAINS).flatMap(({ tokens }) => tokens.map(([, , id]) => id))
    ),
  ];
  const { coins: prices } = await utils.getPriceApiData(
    `/prices/current/${geckoIds.map((id) => `coingecko:${id}`).join(',')}`
  );

  // One chain's RPC or indexer being down must not drop the other chains' pools.
  const chains = Object.keys(CHAINS);
  const settled = await Promise.allSettled(
    chains.map((chain) => getChainPools(chain, prices))
  );
  settled.forEach((result, i) => {
    if (result.status === 'rejected') {
      console.error(`alcor-exchange ${chains[i]} failed: ${result.reason?.message}`);
    }
  });

  return settled
    .filter((result) => result.status === 'fulfilled')
    .flatMap((result) => result.value)
    .filter(utils.keepFinite);
};

module.exports = {
  protocolId: '1500',
  timetravel: false,
  apy,
  url: 'https://alcor.exchange',
};
