const sdk = require('@defillama/sdk');
const axios = require('axios');
const { ethers } = require('ethers');

const utils = require('../utils');
const { SECONDS_PER_YEAR, contracts, tokens } = require('./constants');

const fixedPoint = ethers.utils.parseUnits('1');

const rewardApr = (underlyingToken, stakingPool, rewardToken) => {
  const { enabled, baseEmissionRate, cumulativeStaked } = stakingPool;

  if (!enabled) return 0.0;

  const underlyingTokenPrice = ethers.utils.parseUnits(
    underlyingToken.price.toString()
  );
  const rewardTokenPrice = ethers.utils.parseUnits(
    rewardToken.price.toString()
  );

  // Normalise to 18 decimals and convert LP token => underlying token.
  const cumulativeStakedUsd = ethers.utils
    .parseUnits(cumulativeStaked)
    .mul(ethers.utils.parseUnits('1', 18 - underlyingToken.decimals).toString())
    .mul(underlyingToken.exchangeRateCurrent)
    .div(fixedPoint)
    .mul(underlyingTokenPrice)
    .div(fixedPoint);

  const rewardsPerYearUsd = ethers.utils
    .parseUnits(baseEmissionRate)
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

const apy = async () => {
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

  const liquidityPools = await queryLiquidityPools(tokenAddrs);

  const { address, abi } = contracts.AcceleratedDistributor;
  const rewardToken = (
    await sdk.api.abi.call({
      target: address,
      abi: abi.find((m) => m.name === 'rewardToken'),
    })
  ).output.toLowerCase();

  const stakingTokens = (
    await sdk.api.abi.multiCall({
      calls: lpTokenAddrs.map((i) => ({ target: address, params: i })),
      abi: abi.find((m) => m.name === 'stakingTokens'),
    })
  ).output.map((o, i) => o.output);

  return Object.entries(tokens).map((token, i) => {
    const underlying = token[1].address;

    const underlyingPrice = tokenPrices[`ethereum:${underlying}`]?.price;

    const tvlUsd = (underlyingPrice * totalSupply[i]) / 10 ** decimals[i];

    const apyReward = rewardApr(
      {
        ...token,
        price: underlyingPrice,
        exchangeRateCurrent: liquidityPools[underlying].exchangeRateCurrent,
        decimals: decimals[i],
      },
      stakingTokens[i],
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
  apy,
  url: 'https://across.to/pool',
};
