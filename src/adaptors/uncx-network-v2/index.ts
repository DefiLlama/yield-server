const utils = require('../utils');
const fetch = require('node-fetch');

const API_URL: string =
  'https://api-chain-eth.unicrypt.network/api/v1/farms/search';

const SECONDS_PER_DAY = 86400;

interface Farm {
  apy: number;
  tvl: number;
  spool_address: string;
  stoken_symbol: string;
  meta: {
    lp_meta: {
      token0: { symbol: string; address: string };
      token1: { symbol: string; address: string };
    } | null;
    rewards: Array<{ address: string }>;
    staking_token: { address: string };
    min_staking_period: number;
  };
}

interface Response {
  rows: Array<Farm>;
  count: number;
}

const getData = async () => {
  const body = {
    filters: { sort: 'tvl', sortAscending: false },
    page: 0,
    rows_per_page: 100,
  };
  return await fetch(API_URL, {
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
    method: 'POST',
  }).then(async (data) => await data.json());
};

const getApy = async () => {
  const { rows: farms }: Response = await getData();

  const pools = farms.map((farm) => {
    const isLp = !!farm.meta.lp_meta;
    const symbol = isLp
      ? `${farm.meta.lp_meta.token0.symbol}-${farm.meta.lp_meta.token1.symbol} LP`
      : farm.stoken_symbol;
    const lockDuration = farm.meta.min_staking_period / SECONDS_PER_DAY;

    return {
      pool: farm.spool_address,
      chain: utils.formatChain('ethereum'),
      project: 'uncx-network-v2',
      symbol: symbol.replace('LP', '').trim(),
      poolMeta: lockDuration > 2 ? `${lockDuration} days lock` : null,
      apy: farm.apy,
      tvlUsd: farm.tvl,
      underlyingTokens: isLp
        ? [farm.meta.lp_meta.token0.address, farm.meta.lp_meta.token1.address]
        : [farm.meta.staking_token.address],
      rewardTokens: farm.meta.rewards.map(({ address }) => address),
    };
  });

  return pools;
};

module.exports = {
  timetravel: false,
  apy: getApy,
  url: 'https://app.unicrypt.network/chain/mainnet/farms',
};
