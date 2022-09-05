const axios = require('axios');
const utils = require('../utils');
const { PromisePool } = require('@supercharge/promise-pool');
const { BigNumber } = require('bignumber.js');

const RPC_ENDPOINT = 'https://api.tzkt.io';
const SPICY_URL = 'https://spicya.sdaotools.xyz/api/rest';
const MATTER_CORE = 'KT1K4jn23GonEmZot3pMGth7unnzZ6EaMVjY';

let matterPrice, xtzPrice;
let _spicePools, _spiceTokens;

const fetchXtzPrice = async () => {
  return new BigNumber(
    (await axios(`${RPC_ENDPOINT}/v1/quotes/last`)).data.usd
  ).toFixed(2);
};
const fetchMatterPrice = async (agg) => {
  return (
    await axios(
      `${SPICY_URL}/TokenList?_ilike=${MATTER_CORE}:0&day_agg_start=${agg}`
    )
  ).data.tokens[0].derivedxtz;
};
const fetchTokenNameTzkt = async (contract) => {
  return (await axios(`${RPC_ENDPOINT}/v1/contracts/${contract}`)).data.alias;
};
const fetchTokenNameSpicy = async (token) => {
  return (await axios(`${SPICY_URL}/TokenList?_ilike=${token}`)).data.tokens[0]
    .symbol;
};
const fetchTokenBalances = async (account) => {
  return (
    await axios(
      `${RPC_ENDPOINT}/v1/tokens/balances?account=${account}&limit=100&select=balance,token.id%20as%20id,token.contract%20as%20contract,token.standard%20as%20standard,token.tokenId%20as%20token_id`
    )
  ).data;
};

const fetchSupply = async (contract, id) => {
  const req = id
    ? `/v1/tokens/?contract=${contract}&tokenId=${id}`
    : `/v1/tokens/?contract=${contract}`;
  const supply = (await axios(`${RPC_ENDPOINT}${req}`)).data;

  return new BigNumber(supply[0].totalSupply);
};

const fetchAllPools = async () => {
  if (!_spicePools) _spicePools = axios(`${SPICY_URL}/PoolListAll/`);
  const spicyPools = (await _spicePools).data.pair_info;

  return spicyPools.map((pool) => ({
    contract: pool.contract,
    reserve: pool.reservextz,
    token0: pool.token0,
    token1: pool.token1,
  }));
};

const fetchSpicyTokens = async (agg) => {
  if (!_spiceTokens)
    _spiceTokens = axios(`${SPICY_URL}/TokenList?day_agg_start=${agg}`);
  const spicyTokens = (await _spiceTokens).data.tokens;

  return spicyTokens;
};

const fetchMatterFarms = async (pools, tokens) => {
  const req = `/v1/contracts/${MATTER_CORE}/bigmaps/farms_internal/keys`;
  const farms = (await axios(`${RPC_ENDPOINT}${req}`)).data;

  const req2 = `/v1/contracts/${MATTER_CORE}/storage/`;
  const configs = (await axios(`${RPC_ENDPOINT}${req2}`)).data.configs;

  const today = new Date();
  const active = new Date(configs[0].active_time);

  let activeConfig;

  if (today.getTime() >= active.getTime()) {
    activeConfig = configs[0].farm_configs;
  } else {
    activeConfig = configs[1].farm_configs;
  }

  const output = farms.reduce((a, p) => {
    const uF = activeConfig.find(
      (config) => config.key.fa2_address === p.key.fa2_address
    );
    const findToken = tokens.find(
      (token) => token.tag === `${p.key.fa2_address}:${p.key.token_id}`
    );
    const findPool = pools.find(
      (pool) => pool.contract === `${p.key.fa2_address}`
    );

    if (uF) {
      a.push({
        ...p,
        reward: uF.value.reward_per_sec,
        decimals: findToken ? findToken.decimals : 18,
        symbol: findToken ? findToken.symbol : '',
        token0: findPool ? findPool.token0 : uF.key.fa2_address,
        token1: findPool ? findPool.token1 : '',
        derivedXtz: findToken ? findToken.derivedxtz : 0,
      });
    }

    return a;
  }, []);

  return output.map((farm) => ({
    key: farm.key,
    staked: farm.value.totalStaked,
    reward: farm.reward,
    decimals: farm.decimals,
    token0: farm.token0,
    token1: farm.token1,
    symbol: farm.symbol,
    derivedXtz: farm.derivedXtz,
  }));
};

const matchToMatter = async (farm, spicyPools) => {
  const match = spicyPools.find(
    (pool) => pool.contract == farm.key.fa2_address
  );

  if (match) {
    const symbol = await fetchTokenNameTzkt(farm.key.fa2_address);

    farm.supply = new BigNumber(
      await fetchSupply(farm.key.fa2_address)
    ).shiftedBy(-farm.decimals);
    farm.reserveXtz = new BigNumber(match.reserve);
    farm.staked = new BigNumber(farm.staked).shiftedBy(-farm.decimals);

    if (symbol) {
      farm.symbol = symbol.split(' ').slice(1).join(' ');
    } else {
      const token0Name = await fetchTokenNameSpicy(farm.token0);
      const token1Name = await fetchTokenNameSpicy(farm.token1);

      farm.symbol =
        token0Name && token1Name ? `${token0Name}/${token1Name}` : 'Unknown';
    }

    farm.apr = poolToApr(farm);
    farm.apy = aprToApy(farm.apr);
    farm.tvl = lpToTez(farm);
  } else {
    farm.supply = new BigNumber(
      await fetchSupply(farm.key.fa2_address)
    ).shiftedBy(-farm.decimals);
    farm.staked = new BigNumber(farm.staked).shiftedBy(-farm.decimals);

    farm.apr = tokenToApr(farm);
    farm.apy = aprToApy(farm.apr);
    farm.tvl = lpToTez(farm);
  }

  return farm;
};

const fetchSpicyPoolsAndMatch = async (spicyPools, matterFarms, tokens) => {
  const { results, errors } = await PromisePool.withConcurrency(10)
    .for(matterFarms)
    .process(async (farm) => matchToMatter(farm, spicyPools, matterFarms));

  if (errors && errors.length) {
    throw errors[0];
  }

  return results.filter((result) => result);
};

const lpToTez = (farm) => {
  if (!farm.reserveXtz) {
    return new BigNumber(farm.derivedXtz).multipliedBy(farm.staked).toFixed(0);
  } else {
    const tezPerLp = farm.reserveXtz.dividedBy(
      farm.supply.shiftedBy(-farm.decimals)
    );

    return tezPerLp
      .multipliedBy(farm.staked.shiftedBy(-farm.decimals))
      .toFixed(0);
  }
};

const tokenToApr = (token) => {
  const rewardPerSec = BigNumber(token.reward).shiftedBy(-12);
  const totalStaked = token.staked;
  const stakePrice = token.derivedXtz;
  const combined = totalStaked.multipliedBy(stakePrice);

  const apr =
    combined > 0
      ? new BigNumber(
          ((rewardPerSec * matterPrice * 86400 * 365) / combined) * 100
        )
      : new BigNumber(0);

  return apr;
};

const poolToApr = (pool) => {
  const rewardPerSec = BigNumber(pool.reward).shiftedBy(-12);
  const totalStaked = pool.staked;
  const stakePrice = pool.reserveXtz
    .dividedBy(pool.supply)
    .shiftedBy(-pool.decimals);
  const combined = totalStaked.multipliedBy(stakePrice);

  const apr =
    combined > 0
      ? new BigNumber(
          ((rewardPerSec * matterPrice * 86400 * 365) / combined) * 100
        )
      : new BigNumber(0);

  return apr.shiftedBy(-18);
};

const aprToApy = (apr) => {
  const e = Number(apr / 100);
  const h = Math.pow(1 + e / 52, 52) - 1;

  return h > 0 ? (100 * h).toFixed(2) : 0;
};

const calculateDayAgg = () => {
  let agg_start = new Date();
  agg_start.setDate(agg_start.getDate() - 7);
  agg_start = Math.floor(agg_start.getTime() / 1000);

  return agg_start;
};

const apy = async () => {
  matterPrice = await fetchMatterPrice(calculateDayAgg());
  xtzPrice = await fetchXtzPrice();

  const matterCoreBalances = await fetchTokenBalances(MATTER_CORE);
  const pools = await fetchAllPools();
  const tokens = await fetchSpicyTokens(calculateDayAgg());
  const farms = await fetchMatterFarms(pools, tokens);

  const matchedPools = await fetchSpicyPoolsAndMatch(pools, farms);

  const corePools = matchedPools.map((p) => ({
    pool: `${p.key.fa2_address}`,
    chain: 'Tezos',
    project: 'matter-defi',
    symbol: utils.formatSymbol(p.symbol),
    tvlUsd: Number((p.tvl * xtzPrice).toFixed(2)),
    apyReward: Number(p.apy),
    rewardTokens: [MATTER_CORE],
    underlyingTokens: p.token1 ? [p.token0, p.token1] : [p.token0],
  }));

  return [...corePools];
};

module.exports = {
  timetravel: false,
  apy: apy,
  url: 'https://matterdefi.xyz/#/',
};
