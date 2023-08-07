const sdk = require('@defillama/sdk');
const axios = require('axios');
const { ethers } = require('ethers');
const { getProvider } = require('@defillama/sdk/build/general');
const utils = require('../utils');
const { SECONDS_PER_YEAR, contracts, tokens } = require('./constants');

const fixedPoint = ethers.utils.parseUnits('1');

const rewardApr = (underlyingToken, stakingPool, rewardToken) => {
  const { enabled, baseEmissionRate, cumulativeStaked } = stakingPool;

  if (!enabled) return 0.0;

  // Avoid divide by zero later on.
  if (cumulativeStaked.eq(0)) return Number.MAX_VALUE;

  const underlyingTokenPrice = ethers.utils.parseUnits(
    underlyingToken.price.toString()
  );
  const rewardTokenPrice = ethers.utils.parseUnits(
    rewardToken.price.toString()
  );

  // Normalise to 18 decimals and convert LP token => underlying token.
  const cumulativeStakedUsd = cumulativeStaked
    .mul(ethers.utils.parseUnits('1', 18 - underlyingToken.decimals).toString())
    .mul(underlyingToken.exchangeRateCurrent)
    .div(fixedPoint)
    .mul(underlyingTokenPrice)
    .div(fixedPoint);

  const rewardsPerYearUsd = baseEmissionRate
    .mul(ethers.utils.parseUnits('1', 18 - rewardToken.decimals).toString())
    .mul(SECONDS_PER_YEAR.toString())
    .mul(rewardTokenPrice)
    .div(fixedPoint);

  const apr = ethers.utils.formatUnits(
    rewardsPerYearUsd.mul('100').mul(fixedPoint).div(cumulativeStakedUsd)
  );

  return Number(apr);
};

const queryLiquidityPool = async (l1TokenAddr) => {
  return (await axios.get(`https://across.to/api/pools?token=${l1TokenAddr}`))
    .data;
};

const queryLiquidityPools = async (l1TokenAddrs) => {
  const pools = await Promise.all(
    l1TokenAddrs.map((l1TokenAddr) => queryLiquidityPool(l1TokenAddr))
  );

  return Object.fromEntries(
    pools.map((pool, i) => {
      return [l1TokenAddrs[i].toLowerCase(), pool];
    })
  );
};

const queryStakingPools = async (provider, lpTokenAddrs) => {
  const { address, abi } = contracts.AcceleratedDistributor;
  const adContract = new ethers.Contract(address, abi, provider);
  await adContract.connect();

  const rewardToken = (await adContract.rewardToken()).toLowerCase();
  const pools = Object.fromEntries(
    await Promise.all(
      Object.values(lpTokenAddrs).map(async (lpTokenAddr) => {
        const pool = await adContract.stakingTokens(lpTokenAddr);
        return [lpTokenAddr, pool];
      })
    )
  );

  return {
    rewardToken: rewardToken,
    pools: pools,
  };
};

const main = async () => {
  const provider = getProvider('ethereum');

  // Note lpTokenAddrs is included in the Across API /pools response. These
  // LP token addresses are however hardcoded in constants so that the staking
  // pool lookups can occur in parallel with all other external lookups.
  const tokenAddrs = Object.values(tokens).map((token) => token.address);
  const lpTokenAddrs = Object.values(tokens).map((token) => token.lpAddress);

  const [totalSupplyRes, decimalsRes] = await Promise.all(
    ['erc20:totalSupply', 'erc20:decimals'].map(
      async (m) =>
        await sdk.api.abi.multiCall({
          calls: lpTokenAddrs.map((i) => ({ target: i })),
          abi: m,
        })
    )
  );
  const totalSupply = totalSupplyRes.output.map((o) => o.output);
  const decimals = decimalsRes.output.map((o) => o.output);

  const keys = tokenAddrs.map((addr) => `ethereum:${addr}`).join();
  const tokenPrices = (
    await axios.get(`https://coins.llama.fi/prices/current/${keys}`)
  ).data.coins;

  const [liquidityPools, stakingPools] = await Promise.all([
    queryLiquidityPools(tokenAddrs),
    queryStakingPools(provider, lpTokenAddrs),
  ]);

  return Object.entries(tokens).map((token, i) => {
    const underlying = token[1].address;
    const rewardToken = stakingPools.rewardToken;

    const underlyingPrice = tokenPrices[`ethereum:${underlying}`]?.price;

    const tvlUsd = (underlyingPrice * totalSupply[i]) / 10 ** decimals[i];

    const apyReward = rewardApr(
      {
        ...token,
        price: underlyingPrice,
        exchangeRateCurrent: liquidityPools[underlying].exchangeRateCurrent,
        decimals: decimals[i],
      },
      stakingPools.pools[lpTokenAddrs[i]],
      tokenPrices[`ethereum:${rewardToken}`]
    );

    return {
      pool: underlying, // should be changed to lp token
      chain: 'Ethereum',
      project: 'across',
      symbol: utils.formatSymbol(token[0]),
      tvlUsd,
      underlyingTokens: [underlying],
      apyBase: Number(liquidityPools[underlying].estimatedApy) * 100,
      apyReward: apyReward > 0 ? apyReward : 0,
      rewardTokens: apyReward > 0 ? [rewardToken] : null,
    };
  });
};

module.exports = {
  timetravel: false,
  apy: main,
  url: 'https://across.to/pool',
};
