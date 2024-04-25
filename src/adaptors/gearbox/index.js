const sdk = require('@defillama/sdk');
const superagent = require('superagent');
const axios = require('axios');
const abi = require('./abis.json');
const utils = require('../utils');

const CONTRACTS_REGISTER = '0xA50d4E7D8946a7c90652339CDBd262c375d54D99';
const GEAR_TOKEN = '0xBa3335588D9403515223F109EdC4eB7269a9Ab5D';
const DATA_COMPRESSOR_210 = '0xdc21000028bbe39b113b1cd08d675590d1582cc7';
const DATA_COMPRESSOR_300 = '0xc0101abafce0bd3de10aa1f3dd827672b150436e';

const GEAR_DECIMALS = 1e18;
const BLOCK_TIME = 12;
const SECONDS_PER_YEAR = 365 * 24 * 60 * 60;
const YEARLY_BLOCKS = SECONDS_PER_YEAR / BLOCK_TIME;

function getMulticallOutput({ output }) {
  return output.map(({ output }) => output);
}

/**
 * Bulk loads token prices from defillama, returns mapping "token (lowercase)" => price (float)
 */
async function getPrices(chain, addresses) {
  const uri = `${addresses.map((address) => `${chain}:${address}`)}`;
  const prices = (
    await superagent.get('https://coins.llama.fi/prices/current/' + uri)
  ).body.coins;

  const pricesObj = Object.entries(prices).reduce(
    (acc, [address, price]) => ({
      ...acc,
      [address.split(':')[1].toLowerCase()]: price.price,
    }),
    {}
  );

  return pricesObj;
}

/**
 * Returns mapping between underlying tokens of pools (in lower case) and their symbols, decimals and prices
 */
async function getUnderlyingTokensInfo(chain, poolsData) {
  const underlyings = Array.from(
    new Set(poolsData.map((p) => p.underlying.toLowerCase()))
  );
  const symbols = (
    await sdk.api.abi.multiCall({
      abi: 'erc20:symbol',
      calls: underlyings.map((target) => ({ target })),
      chain: 'ethereum',
    })
  ).output.map((o) => o.output);
  const decimals = await sdk.api.abi
    .multiCall({
      abi: abi.decimals,
      calls: underlyings.map((target) => ({ target })),
      chain,
    })
    .then(getMulticallOutput);
  const prices = await getPrices(chain, underlyings);
  return underlyings.reduce(
    (acc, underlying, i) => ({
      ...acc,
      [underlying]: {
        symbol: symbols[i],
        decimals: Math.pow(10, Number(decimals[i])),
        price: prices[underlying],
      },
    }),
    {}
  );
}

async function getPoolsDaoFees(chain) {
  // all V1, V2, V3 credit managers
  const cms = (
    await sdk.api.abi.call({
      target: CONTRACTS_REGISTER,
      chain,
      abi: abi.getCreditManagers,
    })
  ).output;
  // for each CM, get its pool address
  const pools = await sdk.api.abi
    .multiCall({
      abi: abi.pool,
      calls: cms.map((target) => ({ target })),
      chain,
    })
    .then(getMulticallOutput);
  // ... and also try to get fees
  // it will fail for v1 managers, but we don't care about them
  // it's less calls than we need for checking versions
  const daoFees = await sdk.api.abi
    .multiCall({
      abi: abi.fees,
      calls: cms.map((target) => ({ target })),
      chain,
    })
    .then(getMulticallOutput);

  const result = {};
  for (let i = 0; i < daoFees.length; i++) {
    // null for v1 cms
    if (!!daoFees[i]) {
      // basically, we don't care from which CM to take feeInterest for pool
      result[pools[i].toLowerCase()] = parseInt(daoFees[i].feeInterest);
    }
  }
  return result;
}

function calculateTvl(availableLiquidity, totalBorrowed, price, decimals) {
  // ( availableLiquidity + totalBorrowed ) * underlying price = total pool balance in USD
  const tvl =
    ((parseFloat(availableLiquidity) + parseFloat(totalBorrowed)) / decimals) *
    price;
  return tvl;
}

async function getPoolsV3Data(chain) {
  const stakedDieselTokens = [
    '0x9ef444a6d7F4A5adcd68FD5329aA5240C90E14d2', // sdUSDCV3
    '0xA8cE662E45E825DAF178DA2c8d5Fae97696A788A', // sdWBTCV3
    '0x0418fEB7d0B25C411EB77cD654305d29FcbFf685', // sdWETHV3
  ];
  const [farmInfos, totalSupplies, poolV3Addrs] = await Promise.all([
    sdk.api.abi
      .multiCall({
        abi: abi.farmInfo,
        calls: stakedDieselTokens.map((target) => ({ target })),
        chain,
      })
      .then(getMulticallOutput),
    sdk.api.abi
      .multiCall({
        abi: abi.totalSupply,
        calls: stakedDieselTokens.map((target) => ({ target })),
        chain,
      })
      .then(getMulticallOutput),
    sdk.api.abi
      .multiCall({
        abi: abi.stakingToken,
        calls: stakedDieselTokens.map((target) => ({ target })),
        chain,
      })
      .then(getMulticallOutput),
  ]);
  let farmingPoolsData = {};
  for (let i = 0; i < stakedDieselTokens.length; i++) {
    farmingPoolsData[poolV3Addrs[i]] = {
      stakedDieselToken: stakedDieselTokens[i],
      stakedDieselTokenSupply: totalSupplies[i],
      // just being explicit, since we have no typings
      farmInfo: {
        finished: farmInfos[i].finished,
        duration: farmInfos[i].duration,
        reward: farmInfos[i].reward,
      },
    };
  }

  const pools = (
    await sdk.api.abi.call({
      target: DATA_COMPRESSOR_300,
      chain,
      abi: abi.getPoolsV3List,
    })
  ).output;

  const decimals = await sdk.api.abi
    .multiCall({
      abi: abi.decimals,
      calls: pools.map((p) => ({
        target: p.dieselToken,
      })),
      chain,
    })
    .then(getMulticallOutput);

  return pools.map((pool, i) => ({
    pool: pool.addr,
    availableLiquidity: pool.availableLiquidity,
    totalBorrowed: pool.totalBorrowed,
    supplyRate: pool.supplyRate,
    baseInterestRate: pool.baseInterestRate,
    dieselRate: pool.dieselRate_RAY,
    underlying: pool.underlying,
    withdrawFee: pool.withdrawFee,
    symbol: pool.symbol,
    decimals: Math.pow(10, Number(decimals[i])),
    ...farmingPoolsData[pool.addr],
  }));
}

function calcApyV3(info, supply, gearPrice) {
  const now = Math.floor(Date.now() / 1000);
  if (info.finished <= now) {
    return 0;
  }
  if (supply.amount <= 0) {
    return 0;
  }
  if (supply.price === 0 || gearPrice === 0) {
    return 0;
  }
  if (info.duration === 0) {
    return 0;
  }

  const supplyUsd = (supply.price * supply.amount) / supply.decimals;
  const rewardUsd = (gearPrice * info.reward) / GEAR_DECIMALS;

  return (100 * ((rewardUsd / supplyUsd) * SECONDS_PER_YEAR)) / info.duration;
}

function getApyV3(v3PoolsData, underlyings, gearPrice, daoFees) {
  return v3PoolsData.map((pool) => {
    const underlyingPrice = underlyings[pool.underlying.toLowerCase()].price;
    const daoFee = daoFees[pool.pool.toLowerCase()] ?? 0;
    const totalSupplyUsd = calculateTvl(
      pool.availableLiquidity,
      pool.totalBorrowed,
      underlyingPrice,
      pool.decimals
    );
    const totalBorrowUsd = calculateTvl(
      0,
      pool.totalBorrowed,
      underlyingPrice,
      pool.decimals
    );
    const tvlUsd = totalSupplyUsd - totalBorrowUsd;
    const dieselPrice = (underlyingPrice * pool.dieselRate) / 1e27;
    const apyReward = calcApyV3(
      pool.farmInfo,
      {
        amount: pool.stakedDieselTokenSupply,
        decimals: pool.decimals,
        price: dieselPrice,
      },
      gearPrice
    );

    return {
      pool: pool.pool,
      chain: 'Ethereum',
      project: 'gearbox',
      symbol: underlyings[pool.underlying.toLowerCase()].symbol,
      tvlUsd: tvlUsd,
      apyBase: (pool.supplyRate / 1e27) * 100,
      apyReward,
      underlyingTokens: [pool.underlying],
      rewardTokens: [GEAR_TOKEN],
      url: `https://app.gearbox.fi/pools/${pool.pool}`,
      // daoFee here is taken from last cm connected to this pool. in theory, it can be different for different CMs
      // in practice, it's 25% for v3 cms and 50% for v2 cms
      apyBaseBorrow: ((daoFee + 10000) * (pool.baseInterestRate / 1e27)) / 100,
      apyRewardBorrow: 0,
      totalSupplyUsd,
      totalBorrowUsd,
      ltv: 0, // this is currently just for the isolated earn page
    };
  });
}

async function getApy() {
  //https://gov.gearbox.fi/t/gip-22-gearbox-v2-liquidity-mining-programs/1550
  //"FDV is taken at a smol increase to the 200M$ FDV for strategic rounds"
  const priceKey = `ethereum:${GEAR_TOKEN}`;
  const gearPrice =
    (await axios.get(`https://coins.llama.fi/prices/current/${priceKey}`)).data
      .coins[priceKey]?.price ?? 0;

  const daoFees = await getPoolsDaoFees('ethereum');
  const v3PoolsData = await getPoolsV3Data('ethereum');

  const underlyings = await getUnderlyingTokensInfo('ethereum', v3PoolsData);
  const pools = getApyV3(v3PoolsData, underlyings, gearPrice, daoFees);
  return pools.filter((i) => utils.keepFinite(i));
}

module.exports = {
  timetravel: false,
  apy: getApy,
};
