const superagent = require('superagent');
const Web3 = require('web3');
const sdk = require('@defillama/sdk');
require('dotenv').config({ path: './config.env' });

const utils = require('../utils');
const abi = require('./abi.json');
const baseRewardPoolAbi = require('./baseRewardPoolAbi.json');
const virtualBalanceRewardPoolAbi = require('./virtualBalanceRewardPoolAbi.json');

const poolsDefault = require('./pools.json');
const { symbol } = require('@defillama/sdk/build/erc20');

const web3 = new Web3(process.env.INFURA_CONNECTION);

const crvAddress = '0xD533a949740bb3306d119CC777fa900bA034cd52';
const cvxAddress = '0x4e3FBD56CD56c3e72c1403e103b45Db9da5B9D2B';

const cliffSize = 100000; // * 1e18; //new cliff every 100,000 tokens
const cliffCount = 1000; // 1,000 cliffs
const maxSupply = 100000000; // * 1e18; //100 mil max supply
const projectedAprTvlThr = 1e6;

const getCVXMintAmount = async (crvEarned) => {
  // first get total supply
  const cvxSupply = await supplyOf(cvxAddress);
  // get current cliff
  const currentCliff = cvxSupply / cliffSize;
  // if current cliff is under the max
  if (currentCliff < cliffCount) {
    // get remaining cliffs
    let remaining = cliffCount - currentCliff;

    // multiply ratio of remaining cliffs to total cliffs against amount CRV received
    let cvxEarned = (crvEarned * remaining) / cliffCount;

    // double check we have not gone over the max supply
    let amountTillMax = maxSupply - cvxSupply;
    if (cvxEarned > amountTillMax) {
      cvxEarned = amountTillMax;
    }
    return cvxEarned;
  }
  return 0;
};

const supplyOf = async (contract) => {
  const baseRewardPoolContract = new web3.eth.Contract(
    baseRewardPoolAbi,
    contract
  );
  const supply = await baseRewardPoolContract.methods.totalSupply().call();
  return Number(supply) / 10 ** 18;
};

let extraRewardsPrices = {};

const rewardRate = async (contract) => {
  const baseRewardPoolContract = new web3.eth.Contract(
    baseRewardPoolAbi,
    contract
  );
  const res = await baseRewardPoolContract.methods.rewardRate().call();
  const periodFinish = await baseRewardPoolContract.methods
    .periodFinish()
    .call();

  const extraRewardsLength = await baseRewardPoolContract.methods
    .extraRewardsLength()
    .call();

  const extraRewards = [];

  for (let i = 0; i < extraRewardsLength; i++) {
    const extraRewardPoolAddress = await baseRewardPoolContract.methods
      .extraRewards(i)
      .call();

    const extraReward = new web3.eth.Contract(
      baseRewardPoolAbi,
      extraRewardPoolAddress
    );
    const periodFinish = await extraReward.methods.periodFinish().call();
    const isFinished = new Date() > periodFinish * 1000;
    if (isFinished) continue;

    const extraRewardRate =
      (await extraReward.methods.rewardRate().call()) / 1e18;
    const token = await extraReward.methods.rewardToken().call();
    if (!extraRewardsPrices[token.toLowerCase()]) {
      try {
        const price = await utils.getData(
          'https://api.coingecko.com/api/v3/coins/ethereum/contract/' +
            token.toLowerCase()
        );
        extraRewardsPrices[token.toLowerCase()] =
          price.market_data.current_price.usd;
      } catch {
        extraRewardsPrices[token.toLowerCase()] = 0;
      }
    }

    extraRewards.push({ extraRewardRate, token });
  }

  const isFinished = new Date() > periodFinish * 1000;

  const rate = res / 10 ** 18;

  return { isFinished, rate, extraRewards };
};

const getCrvCvxPrice = async () => {
  const url =
    'https://api.coingecko.com/api/v3/simple/price?ids=convex-finance%2Ccurve-dao-token&vs_currencies=usd';

  const response = await superagent.get(url);
  const data = response.body;
  const crvPrice = data['curve-dao-token'].usd;
  const cvxPrice = data['convex-finance'].usd;
  return { crvPrice, cvxPrice };
};

const main = async () => {
  const { apys: curveApys } = await utils.getData(
    'https://www.convexfinance.com/api/curve-apys'
  );
  const { cvxPrice, crvPrice } = await getCrvCvxPrice();

  const poolsList = (
    await Promise.all(
      ['factory', 'main', 'crypto', 'factory-crypto'].map((registry) =>
        utils.getData(`https://api.curve.fi/api/getPools/ethereum/${registry}`)
      )
    )
  )
    .map(({ data }) => data.poolData)
    .flat();

  const {
    data: { gauges },
  } = await utils.getData('https://api.curve.fi/api/getGauges');

  const mappedGauges = Object.entries(gauges).reduce(
    (acc, [name, gauge]) => ({
      ...acc,
      ...([
        'fantom',
        'optimism',
        'xdai',
        'polygon',
        'avalanche',
        'arbitrum',
      ].some((chain) => gauge.name.includes(chain))
        ? {}
        : { [gauge.swap_token.toLowerCase()]: { ...gauge } }),
    }),
    {}
  );

  const convexBoosterAddress = '0xF403C135812408BFbE8713b5A23a04b3D48AAE31';
  const convexBoosterContract = new web3.eth.Contract(
    abi.Booster,
    convexBoosterAddress
  );

  const poolLength = await convexBoosterContract.methods.poolLength().call();
  const poolsRes = await sdk.api.abi.multiCall({
    requery: true,
    abi: abi.Booster.find(({ name }) => name === 'poolInfo'),
    calls: [...Array.from({ length: poolLength }).keys()].map((i) => ({
      target: convexBoosterAddress,
      params: i,
    })),
  });
  const pools = poolsRes.output.map(({ output }) => output);

  const enrichedPools = pools.map((pool) => ({
    ...pool,
    ...poolsList.find(
      ({ address, lpTokenAddress, gaugeAddress }) =>
        address.toLowerCase() === pool.lptoken.toLowerCase() ||
        pool.lptoken.toLowerCase() === (lpTokenAddress || '').toLowerCase() ||
        (gaugeAddress || '').toLowerCase() === pool.gauge.toLowerCase()
    ),
  }));

  const withCvxTvl = (
    await Promise.all(
      enrichedPools.map(async (pool) => {
        const tokenContract = new web3.eth.Contract(abi.Pool, pool.token);
        const totalSupply = await tokenContract.methods.totalSupply().call();
        const decimals = await tokenContract.methods.decimals().call();
        const gauge = mappedGauges[pool.lptoken.toLowerCase()];
        if (!gauge) return;
        const virtualPrice = gauge.swap_data.virtual_price / 10 ** 18;
        if (!pool.coinsAddresses) return null;
        let v2PoolUsd;
        if (pool.totalSupply == 0) {
          const usdValue = pool.coins.reduce(
            (acc, coin) =>
              acc +
              (Number(coin.poolBalance) / 10 ** coin.decimals) * coin.usdPrice,
            0
          );
          let supply = pool.coins.reduce(
            (acc, coin) => acc + Number(coin.poolBalance) / 10 ** coin.decimals,
            0
          );

          if (pool.assetTypeName === 'usd') supply = usdValue / virtualPrice;

          v2PoolUsd = (totalSupply / 10 ** decimals / supply) * usdValue;
        }

        return {
          ...pool,
          coinsAddresses: pool.coinsAddresses.filter(
            (address) =>
              address !== '0x0000000000000000000000000000000000000000'
          ),
          cvxTvl: v2PoolUsd
            ? v2PoolUsd
            : ((totalSupply * virtualPrice) /
                (pool.totalSupply * virtualPrice ||
                  pool.usdTotal * 10 ** decimals)) *
              pool.usdTotal,
          currency: 'USD',
        };
      })
    )
  ).filter(Boolean);

  const extraPrices = {};

  const poolsWithApr = await Promise.all(
    withCvxTvl.map(async (pool) => {
      const curveSwap = pool.address;

      const { rate, isFinished, extraRewards } = await rewardRate(
        pool.crvRewards
      );

      const extraRewardsApr = extraRewards.map((extra) => {
        const usdPerYear =
          Number(extra.extraRewardRate) *
          Number(extraRewardsPrices[extra.token.toLowerCase()]) *
          86400 *
          365 *
          100;
        const apy = usdPerYear / pool.cvxTvl;
        return apy;
      });
      const gauge = mappedGauges[pool.lptoken.toLowerCase()];

      const crvPerUnderlying = rate;

      const crvPerYear = crvPerUnderlying * 86400 * 365;
      const cvxPerYear = await getCVXMintAmount(crvPerYear);

      const apr = (cvxPerYear * cvxPrice * 100) / pool.cvxTvl;
      const crvApr = (crvPerYear * crvPrice * 100) / pool.cvxTvl;

      const extrApr = extraRewardsApr.reduce((acc, val) => acc + val, 0) || 0;

      // we set 'CVX vAPR' and 'CRV vAPR' to 0 if both isFinished and tvl < THR;
      // reason: sometimes even for very large pools rewards aren't streaming and require
      // a harvest call. most often, for large pools the current apr (for CVX vAPR and CRV vAPR)
      // thus drops to 0 because isFinished is true. for cvxTvl >= THR we use projected apr instead
      // so we avoid cases where eg LDO rewards are 0 just because rewards haven't been harvested yet
      return {
        ...pool,
        apr: isFinished && pool.cvxTvl < projectedAprTvlThr ? 0 : apr,
        crvApr: isFinished && pool.cvxTvl < projectedAprTvlThr ? 0 : crvApr,
        extrApr,
        extraTokens: extraRewards.map(({ token }) => token),
      };
    })
  );

  const getPoolApy = (pool) => {
    const defaultPool =
      poolsDefault.find(
        ({ lptoken }) => lptoken.toLowerCase() === pool.lptoken.toLowerCase()
      ) || {};
    const poolName =
      defaultPool.name ||
      (
        (pool.name || '').toLowerCase() +
        (pool.symbol || '').toLowerCase() +
        pool.coins.map(({ symbol }) => symbol.toLowerCase()).join('')
      ).replace('/', '');

    let [name, apyObj] =
      Object.entries(curveApys).find(([name, val]) =>
        poolName.includes(name)
      ) || [];

    if (defaultPool.name) {
      name = defaultPool.name;
      apyObj = curveApys[defaultPool.name];
    }

    const apy = (apyObj && apyObj.crvApy) || 0;
    const baseApy = (apyObj && apyObj.baseApy) || 0;

    return { apy, baseApy };
  };

  const res = poolsWithApr
    .map((pool) => {
      const { apy, baseApy } = getPoolApy(pool);

      return {
        pool: pool.lptoken,
        chain: utils.formatChain('ethereum'),
        project: 'convex-finance',
        symbol: pool.coins.map((coin) => coin.symbol).join('-'),
        tvlUsd: pool.cvxTvl,
        apyBase: baseApy,
        apyReward: pool.crvApr + pool.apr + pool.extrApr,
        underlyingTokens: pool.coins.map(({ address }) => address),
        rewardTokens: [
          '0xd533a949740bb3306d119cc777fa900ba034cd52', //crv
          '0x4e3fbd56cd56c3e72c1403e103b45db9da5b9d2b', // cvx
          ...pool.extraTokens,
        ],
      };
    })
    .filter((pool) => !pool.symbol.toLowerCase().includes('ust'));

  return res;
};

module.exports = {
  timetravel: false,
  apy: main,
  url: 'https://www.convexfinance.com/stake',
};
