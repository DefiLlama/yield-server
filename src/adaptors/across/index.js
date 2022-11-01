const { ethers } = require('ethers');
const { getProvider } = require('@defillama/sdk/build/general');
const utils = require('../utils');
const { SECONDS_PER_YEAR, contracts, tokens } = require('./constants');

const fixedPoint = ethers.utils.parseUnits("1");

const rewardApr = (underlyingToken, stakingPool, rewardToken) => {
  const { enabled, baseEmissionRate, cumulativeStaked } = stakingPool.stakingTokens;

  if (!enabled) return 0.0;

  // Avoid divide by zero later on.
  if (cumulativeStaked.eq(0)) return Number.MAX_VALUE;

  const underlyingTokenPrice = ethers.utils.parseUnits(underlyingToken.price.toString());
  const rewardTokenPrice = ethers.utils.parseUnits(rewardToken.price.toString());

  // Normalise to 18 decimals and convert LP token => underlying token.
  const cumulativeStakedUsd = cumulativeStaked
    .mul(ethers.utils.parseUnits("1", 18 - underlyingToken.decimals).toString())
    .mul(underlyingToken.exchangeRateCurrent)
    .div(fixedPoint)
    .mul(underlyingTokenPrice)
    .div(fixedPoint);

  const rewardsPerYearUsd = baseEmissionRate
    .mul(ethers.utils.parseUnits("1", 18 - rewardToken.decimals).toString())
    .mul(SECONDS_PER_YEAR.toString())
    .mul(rewardTokenPrice)
    .div(fixedPoint);

  const apr = ethers.utils.formatUnits(
    rewardsPerYearUsd
    .mul("100")
    .mul(fixedPoint)
    .div(cumulativeStakedUsd)
  );

  return Number(apr);
};

const buildPool = (token, tokenPrices, liquidityPool, stakingPool) => {
  const rewardTokenAddr = stakingPool.rewardToken;
  const apyReward = rewardApr(
    {
      ...token,
      price: tokenPrices[token.address].price,
      exchangeRateCurrent: liquidityPool.exchangeRateCurrent
    },
    stakingPool,
    tokenPrices[rewardTokenAddr]
  ).toFixed(6);

  const poolData = {
    pool: token.address,
    chain: utils.formatChain('ethereum'), // All yield on Mainnet
    project: 'across',
    symbol: utils.formatSymbol(token.symbol),
    tvlUsd:
      (token.price * Number(liquidityPool.totalPoolSize)) /
      10 ** token.decimals,
    underlyingTokens: [token.address],
    apyBase: Number(liquidityPool.estimatedApy) * 100,
  };

  if (apyReward > 0.0) {
    poolData["rewardTokens"] = [rewardTokenAddr];
    poolData["apyReward"] = apyReward;
  };

  return poolData;
};

const queryLiquidityPool = async (l1TokenAddr) => {
  return await utils.getData(
    `https://across.to/api/pools?token=${l1TokenAddr}`
  );
};

const queryLiquidityPools = async (l1TokenAddrs) => {
  const pools = await Promise.all(
    l1TokenAddrs.map((l1TokenAddr) => queryLiquidityPool(l1TokenAddr))
  );
  return Object.fromEntries(
    pools.map((pool) => {
      return [pool.l1Token.toLowerCase(), pool];
    })
  );
};

const queryStakingPool = async (adContract, lpTokenAddr) => {
  const [
    baseReward, [
      enabled,
      baseEmissionRate,
      maxMultiplier,
      secondsToMaxMultiplier,
      cumulativeStaked,
      rewardsPerTokenStaked,
      lastUpdateTime
    ],
  ] = await Promise.all([
    adContract.baseRewardPerToken(lpTokenAddr),
    adContract.stakingTokens(lpTokenAddr),
  ]);

  return {
    baseReward,
    stakingTokens: {
      enabled,
      baseEmissionRate,
      maxMultiplier,
      secondsToMaxMultiplier,
      cumulativeStaked,
      rewardsPerTokenStaked,
      lastUpdateTime,
    },
  };
};

const queryStakingPools = async (provider, lpTokenAddrs) => {
  const { address, abi } = contracts.AcceleratedDistributor
  const adContract = new ethers.Contract(address, abi, provider);
  await adContract.connect();

  const rewardToken = (await adContract.rewardToken()).toLowerCase();
  const pools = Object.fromEntries(
    await Promise.all(
      Object.values(lpTokenAddrs).map(async (lpTokenAddr) => {
        const pool = await queryStakingPool(adContract, lpTokenAddr);
        return [lpTokenAddr, pool];
      })
    )
  );

  return {
    rewardToken: rewardToken,
    pools: pools,
  };
};

const l1TokenPrices = async (l1TokenAddrs) => {
  const l1TokenQuery = l1TokenAddrs.map((addr) => `ethereum:${addr}`).join();
  const data = await utils.getData(
    `https://coins.llama.fi/prices/current/${l1TokenQuery}`
  );

  return Object.fromEntries(
    l1TokenAddrs.map((addr) => {
      const { decimals, price } = data.coins[`ethereum:${addr}`];
      return [addr, { price, decimals }];
    })
  );
};

const main = async () => {
  const provider = getProvider('ethereum');

  // Note lpTokenAddrs is included in the Across API /pools response. These
  // LP token addresses are however hardcoded in constants so that the staking
  // pool lookups can occur in parallel with all other external lookups.
  const tokenAddrs = Object.values(tokens).map((token) => token.address);
  const lpTokenAddrs = Object.values(tokens).map((token) => token.lpAddress);

  const [liquidityPools, stakingPools, tokenPrices] = await Promise.all([
    queryLiquidityPools(tokenAddrs),
    queryStakingPools(provider, lpTokenAddrs),
    l1TokenPrices(tokenAddrs),
  ]);


  return Object.entries(tokens).map(([symbol, token]) => {
    const { address } = token;
    return buildPool(
      {
        address,
        symbol,
        decimals: tokenPrices[address].decimals,
        price: tokenPrices[address].price,
      },
      tokenPrices,
      liquidityPools[address],
      {
        rewardToken: stakingPools.rewardToken,
        ...stakingPools.pools[token.lpAddress],
      },
    );
  });
};

module.exports = {
  timetravel: false,
  apy: main,
  url: 'https://across.to/pool',
};
