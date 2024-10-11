const abiMcV3 = require('./masterchefv3.json');
const { getBunniVaultsForPool, getPricePerFullShare, getProtocolFee, getPoolData, getTokensForPool, getTotalSupply, getReservesForBunniVault } = require('./calls');

const utils = require('../utils');
const sdk = require('@defillama/sdk');
const bn = require('bignumber.js');
const fetch = require('node-fetch');
const { fetchPoolAvgInfo, fetchPoolsFromSubgraph, fetchTokenPricesFromSubgraph } = require('./subgraphCalls');

const ALB = {
  base: '0x1dd2d631c92b1acdfcdd51a0f7145a50130050c4',
};

const chainIds = {
  base: {
    id: 8453,
    mchef: '0x52eaeCAC2402633d98b95213d0b473E069D86590',
    abi: abiMcV3,
  },
};

const getFarmApyReward = (pid, tvlUsd, chain, prices, subgraphPrices, rewards) => {
  const { addresses, symbols, decimals, rewardsPerSec } = rewards;

  let apyReward = 0;
  const SECONDS_IN_YEAR = 31536000;

  for (let i = 0; i < addresses.length; i++) {
    const tokenAddress = addresses[i];
    const rewardPerSec = rewardsPerSec[i];
    const tokenDecimals = decimals[i];

    const tokenPrice = prices[`${chain}:${tokenAddress.toLowerCase()}`]?.price || subgraphPrices[tokenAddress.toLowerCase()]?.derivedUSD || 0;

    const yearlyRewardUsd = (rewardPerSec / Math.pow(10, tokenDecimals)) * SECONDS_IN_YEAR * tokenPrice;

    apyReward += (yearlyRewardUsd / tvlUsd) * 100;
  }

  return { apyReward, rewardTokens: addresses };
};

const calculateApyBase = (avgVolume, liquidity, totalSupply, poolLiquidity, fee, protocolFee, totalUsd) => {
  // console.log('We are calculating APY with the following parameters: ', {
  //   avgVolume,
  //   liquidity,
  //   totalSupply,
  //   poolLiquidity,
  //   fee,
  //   protocolFee,
  // });
  const liqRatio = (liquidity * totalSupply) / poolLiquidity / 1e18;
  return (
    ((avgVolume *
      365 *
      (Number(fee) / 1e6) *
      liqRatio *
      (1 - protocolFee)) /
      totalUsd) *
    100
  );
};

const processPoolInfos = async (poolInfos) => {
  const pools = await fetchPoolsFromSubgraph();
  const {protocolFee, newProtocolFee} = await getProtocolFee();

  const allTokens = [
    ...new Set(pools.map((p) => [p.token0, p.token1]).flat()),
  ];

  const { albPrice, prices } = await getBaseTokensPrice(allTokens, 'base');
  const subgraphPrices = await fetchTokenPricesFromSubgraph();

  const results = [];

  for (const pool of pools) {
    const bunniVaults = await getBunniVaultsForPool(pool.id);
    const avgInfo = await fetchPoolAvgInfo(pool.id);

    for (const bunniVault of bunniVaults) {
      const tokens = await getTokensForPool(bunniVault.poolAddress, 'base');
      if (!tokens) {
        console.log(`Could not find tokens for pool ${bunniVault.poolAddress}`);
        continue;
      };

      const matchingPoolInfo = poolInfos.find((info) => info.lpToken === bunniVault.bunniToken);
      
      const poolData = await getPoolData(bunniVault.poolAddress, 'base');
      if (!poolData) {
        console.log(`Could not find pool data for pool ${bunniVault.poolAddress}`);
        continue
      }

      const { slot0, fee, liquidity } = poolData;

      const pricePerShare = await getPricePerFullShare(bunniVault);
      if (!pricePerShare) {
        console.log(`Could not find price per share for pool ${bunniVault.poolAddress}`);
        continue;
      }

      const totalSupply = await getTotalSupply(bunniVault.bunniToken, 'base');
      const reserves = await getReservesForBunniVault(bunniVault, tokens.token0.decimals, tokens.token1.decimals);

      const currentTick = slot0.tick;
      const isInRange = (Number(currentTick) >= Number(bunniVault.tickLower)) && (Number(currentTick) <= Number(bunniVault.tickUpper));

      const token0Price = prices[`base:${tokens.token0.address?.toLowerCase()}`]?.price || subgraphPrices[tokens.token0.address?.toLowerCase()]?.derivedUSD || 0;
      const token1Price = prices[`base:${tokens.token1.address?.toLowerCase()}`]?.price || subgraphPrices[tokens.token1.address?.toLowerCase()]?.derivedUSD || 0;

      const token0USDValue = reserves.reserve0 * token0Price;
      const token1USDValue = reserves.reserve1 * token1Price;
      const totalUSDValue = token0USDValue + token1USDValue;

      const apyBase = isInRange
        ? calculateApyBase(
            avgInfo.volumeUSD,
            Number(pricePerShare.liquidity),
            Number(totalSupply),
            Number(liquidity),
            Number(fee),
            protocolFee,
            totalUSDValue
          )
        : 0;

      let extraApy = 0;

      if (matchingPoolInfo && matchingPoolInfo?.rewards) {
        const { apyReward, rewardTokens } = getFarmApyReward(
          matchingPoolInfo.pid,
          totalUSDValue,
          'base',
          prices,
          subgraphPrices,
          matchingPoolInfo.rewards
        );
        extraApy = apyReward;
      }
      const tickRange = Number(bunniVault.tickUpper) - Number(bunniVault.tickLower);
      let poolMeta = '';
      if (
        Math.abs(Number(bunniVault.tickLower) + 887272) <= 1000 &&
        Math.abs(Number(bunniVault.tickUpper) - 887272) <= 1000
      ) {
        poolMeta = 'Infinite';
      } else if (tickRange > 10000) {
        poolMeta = 'Wide';
      } else if ((tickRange >= 3000 && tickRange <= 10000)) {
        poolMeta = 'Narrow';
      } else if (tickRange < 3000) {
        poolMeta = 'Ultra Narrow';
      }

      if (totalUSDValue > 0) results.push({
        pool: bunniVault.poolAddress,
        bunniToken: bunniVault.bunniToken,
        chain: 'base',
        symbol: prices[`base:${tokens.token0.address?.toLowerCase()}`]?.symbol + '-' + prices[`base:${tokens.token1.address?.toLowerCase()}`]?.symbol,
        project: 'alien-base-v3',
        apyBase,
        apyReward: extraApy,
        rewardTokens: matchingPoolInfo?.rewards?.addresses || [],
        underlyingTokens: [tokens.token0.address, tokens.token1.address],
        url: `https://app.alienbase.xyz/add/${tokens.token0.address}/${tokens.token1.address}`,
        tvlUsd: totalUSDValue,
        poolMeta,
      });
      // console.log(`For the bunni token ${bunniVault.bunniToken}, APY: ${apyBase.toFixed(2)}%`);
      // if (matchingPoolInfo?.rewards) {
      //   console.log(`For the bunni token ${bunniVault.bunniToken}, EXTRA APY Reward: ${extraApy?.toFixed(2)}%`);
      // }
    }
  }

  return results;
};


const getAlbAprs = async (chain) => {
  if (chainIds[chain] === undefined) return [];

  const masterChef = chainIds[chain].mchef;
  const abi = chainIds[chain].abi;

  const poolLength = await sdk.api.abi
    .call({
      abi: abi.find((m) => m.name === 'poolLength'),
      target: masterChef,
      chain,
    })
    .then((o) => o.output);
  const totalAllocPoint = await sdk.api.abi
    .call({
      abi: abi.find((m) => m.name === 'totalAllocPoint'),
      target: masterChef,
      chain,
    })
    .then((o) => o.output);
  const latestPeriodAlbPerSecond = await sdk.api.abi
    .call({
      abi: abi.find((m) => m.name === 'albPerSec'),
      target: masterChef,
      chain,
    })
    .then((o) => o.output);

  const albPerSecond = new bn(latestPeriodAlbPerSecond.toString())
    .div(1e18)
    // .div(1e12)
    .toString();

    const poolInfoCalls = Array.from({ length: +poolLength })
    .map((_, i) => i)
    .filter((i) => i !== 0)
    .map((i) => {
      return {
        target: masterChef,
        params: i,
      };
    });
  
  const poolInfos = await sdk.api.abi
    .multiCall({
      abi: abi.find((m) => m.name === 'poolInfo'),
      calls: poolInfoCalls,
      chain,
    })
    .then((o) =>
      o.output
        .map((r, index) => ({
          ...r.output,
          pid: index + 1,
        }))
        .filter((r) => r.allocPoint !== '0' && r.totalLiquidity !== '0')
    );
  
  const validPIDs = poolInfos.map((info) => info.pid);
  
  const poolRewardsCalls = validPIDs.map((pid) => ({
    target: masterChef,
    params: pid,
  }));
  
  const poolRewards = await sdk.api.abi.multiCall({
    abi: abi.find((m) => m.name === 'poolRewardsPerSec'),
    calls: poolRewardsCalls,
    chain,
  });
  
  const mergedPools = poolInfos.map((info, index) => {
    const rewards = poolRewards.output[index].output;
  
    return {
      ...info,
      rewards: {
        addresses: rewards.addresses,
        symbols: rewards.symbols,
        decimals: rewards.decimals,
        rewardsPerSec: rewards.rewardsPerSec,
      },
    };
  });
  
  const processedInfo = await processPoolInfos(mergedPools);

  return processedInfo;
};

const getBaseTokensPrice = async (allTokens, chain) => {
  let priceKeys = {
    alb: '0x1dd2d631c92b1acdfcdd51a0f7145a50130050c4',
  };

  let prices = (
    await utils.getData(
      `https://coins.llama.fi/prices/current/${Object.values(priceKeys)
        .map((t) => `base:${t}`)
        .concat(allTokens.map((t) => `${chain}:${t.id}`))
        .join(',')}`
    )
  ).coins;

  const albriceData = prices[`base:${priceKeys.alb}`];

  const albId = `${chain}:${ALB[chain]}`;

  if (ALB[chain] && !prices[albId]) {
    prices[albId] = albriceData;
  }

  return { albPrice: albriceData.price, prices };
};

module.exports = {
  getAlbAprs,
  ALB,
  chainIds,
  getBaseTokensPrice,
};
