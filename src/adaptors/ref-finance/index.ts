const axios = require('axios');

const FARM_V1_CONTRACT = 'v2.ref-farming.near';
const FARM_V2_CONTRACT = 'boostfarm.ref-labs.near';
const endpoint = 'https://rpc.mainnet.near.org/';
const indexerUrl = 'https://indexer.ref.finance/';
const sodakiApiUrl = 'https://api.stats.ref.finance/api';
const STABLE_POOL_IDS = ['1910', '3020', '3364', '3433'];
const boostBlackList = ['3612'];

const LP_TOKEN_DECIMALS = 24;
const LP_STABLE_TOKEN_DECIMALS = 18;

async function call(contract, method, args = {}) {
  const result = await axios.post(endpoint, {
    jsonrpc: '2.0',
    id: '1',
    method: 'query',
    params: {
      request_type: 'call_function',
      finality: 'final',
      account_id: contract,
      method_name: method,
      args_base64: Buffer.from(JSON.stringify(args)).toString('base64'),
    },
  });
  if (result.data.error) {
    throw new Error(`${result.data.error.message}: ${result.data.error.data}`);
  }
  return JSON.parse(Buffer.from(result.data.result.result).toString());
}

async function commonCall(url, method, args = {}) {
  const result = await axios({
    method: 'get',
    url: url + method,
    params: args,
  });
  if (result.data.error) {
    throw new Error(`${result.data.error.message}: ${result.data.error.data}`)
  }
  return result.data;
}

function getListSeedsInfo() {
  return call(FARM_V2_CONTRACT, 'list_seeds_info');
}

function getListSeedFarms(seed_id) {
  return call(FARM_V2_CONTRACT, 'list_seed_farms', { seed_id });
}

function getPoolsByIds(poolIds) {
  const ids = poolIds.join('|');
  if (!ids) return [];
  return commonCall(indexerUrl, 'list-pools-by-ids', { ids });
}

async function get24hVolume(pool_id) {
  const requestUrl = sodakiApiUrl + `/pool/${pool_id}/rolling24hvolume/sum`;
  return commonCall(requestUrl, '');
}

function ftGetTokenMetadata(tokenId) {
  return call(tokenId, 'ft_metadata');
}

function getTokenPrices() {
  return commonCall(indexerUrl, 'list-token-price');
}

function getPoolFeeApr(dayVolume, pool) {
  let result = '0';
  if (dayVolume) {
    const { total_fee, tvl } = pool;
    const revenu24h = (total_fee / 10000) * 0.8 * Number(dayVolume);
    if (tvl > 0 && revenu24h > 0) {
      const annualisedFeesPrct = ((revenu24h * 365) / tvl) * 100;
      result = annualisedFeesPrct.toString();
    }
  }
  return result;
}

async function getV2SeedFarmsPools() {
  // get all seeds
  const list_seeds = await getListSeedsInfo();
  // get all farms
  const farmsPromiseList = [];
  const poolIds = new Set();
  list_seeds.forEach((seed) => {
    const { seed_id } = seed;
    if (seed_id.indexOf('@') > -1) {
      const poolId = seed_id.substring(seed_id.indexOf('@') + 1);
      poolIds.add(poolId);
    }
    farmsPromiseList.push(getListSeedFarms(seed_id));
  });
  const temp_farms = await Promise.all(farmsPromiseList);
  const list_farms = [];
  temp_farms.forEach((farms) => {
    const runningFarms = farms.filter((farm) => {
      if (farm.status != 'Ended') return true;
    });
    list_farms.push(runningFarms);
  });
  // get all pools
  const pools = await getPoolsByIds(Array.from(poolIds));
  // get all pools get24hVolume
  const ids = Array.from(poolIds);
  const promiseVolume = ids.map((poolId) => {
    return get24hVolume(poolId);
  });
  const allPools24Volume = await Promise.all(promiseVolume);
  const tempMap = {};
  ids.forEach((id, index) => {
    tempMap[id] = allPools24Volume[index];
  });

  // organization
  const seedsFarmsPools = [];
  list_seeds.forEach((seed, index) => {
    let pool = null;
    if (seed.seed_id.indexOf('@') > -1) {
      const id = seed.seed_id.substring(seed.seed_id.indexOf('@') + 1);
      pool = pools.find((p) => {
        if (+p.id == +id) return true;
      });
    }
    // filter no farms seed
    if (list_farms[index].length > 0) {
      const poolApy = getPoolFeeApr(tempMap[pool.id], pool);
      seedsFarmsPools.push({
        id: seed.seed_id,
        seed,
        farmList: list_farms[index],
        pool,
        poolApy,
      });
    }
  });
  return seedsFarmsPools;
}

function toReadableNumber(decimals, number) {
  if (!decimals) return number;

  const wholeStr = number.substring(0, number.length - decimals) || '0';
  const fractionStr = number
    .substring(number.length - decimals)
    .padStart(decimals, '0')
    .substring(0, decimals);

  return `${wholeStr}.${fractionStr}`.replace(/\.?0+$/, '');
}

async function getV2FarmData() {
  const v2_list = await getV2SeedFarmsPools();
  const tokenPriceList = await getTokenPrices();
  const target_list = [];
  // get all rewards meta data
  const promise_new_list = v2_list.map(async (data) => {
    const { farmList } = data;
    const promise_farm_meta_data = farmList.map(async (farm) => {
      const tokenId = farm.terms.reward_token;
      const tokenMetadata = await ftGetTokenMetadata(tokenId);
      farm.token_meta_data = tokenMetadata;
      return farm;
    });
    await Promise.all(promise_farm_meta_data);
  });
  await Promise.all(promise_new_list);
  v2_list.forEach(async (data) => {
    const { seed, pool, farmList, poolApy } = data;
    const { total_seed_amount } = seed;
    // get seed tvl
    const { tvl, id, shares_total_supply } = pool;
    const DECIMALS = new Set(STABLE_POOL_IDS || []).has(id?.toString())
      ? LP_STABLE_TOKEN_DECIMALS
      : LP_TOKEN_DECIMALS;
    const seedTotalStakedAmount = toReadableNumber(DECIMALS, total_seed_amount);
    const poolShares = Number(toReadableNumber(DECIMALS, shares_total_supply));
    const seedTvl =
      poolShares == 0
        ? 0
        : Number(
            ((Number(seedTotalStakedAmount) * tvl) / poolShares).toString()
          );
    // get apy per farm
    let totalApy = 0;
    const rewardsTokens = [];
    farmList.forEach((farm) => {
      const { token_meta_data } = farm;
      const { daily_reward, reward_token } = farm.terms;
      const readableNumber = toReadableNumber(
        token_meta_data.decimals,
        daily_reward
      );
      const reward_token_price = Number(
        tokenPriceList[reward_token]?.price || 0
      );
      const apy =
        seedTvl == 0
          ? 0
          : (Number(readableNumber) * 360 * reward_token_price) / seedTvl;
      totalApy += Number(apy);
      rewardsTokens.push(reward_token);
    });
    const { token_symbols, token_account_ids } = pool;
    if (boostBlackList.indexOf(pool.id) == -1) {
      const target = {
        pool: 'ref-pool-' + pool.id,
        chain: 'NEAR',
        project: 'ref-finance',
        symbol: token_symbols?.join('-'),
        tvlUsd: seedTvl,
        apyReward: totalApy * 100,
        baseApy: poolApy * 100,
        underlyingTokens: token_account_ids,
        rewardTokens: rewardsTokens,
      };
      target_list.push(target);
    }
  });
  return target_list;
}

module.exports = {
  timetravel: false,
  apy: getV2FarmData,
  url: 'https://app.ref.finance/v2farms',
};
