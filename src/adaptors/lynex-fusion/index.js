const utils = require('../utils');
const BigNumber = require('bignumber.js');
const { Web3 } = require('web3');
const pairAPI = require('./abis/pairAPI.json');
const factoryAbi = require('./abis/factoryABI.json');
const { getPrices, getTokenPrice, fetchPeriodFinish, fetchExtraPoolRewards, fromWei, loadActiveStrategies, fetchGammaInfo } = require('./utils');

const TVL_FILTER = 10000
const TEST_ACCOUNT = '0x1111110000000000000000000000000000000000'

const getApy = async () => {
  const web3 = new Web3('https://rpc.linea.build');
  const pairAPIContract = new web3.eth.Contract(pairAPI, '0x6c84329CC8c37376eb32db50a17F3bFc917c3665');
  const factoryContract = new web3.eth.Contract(factoryAbi, '0xBc7695Fd00E3b32D08124b7a4287493aEE99f9ee');
  const lynxAddress = '0x1a51b19ce03dbe0cb44c1528e34a7edd7771e9af';
  const olynxAddress = '0x63349ba5e1f71252ecd56e8f950d1a518b400b60';
  let pairLength = 0;
  let poolInfos;
  let activeStrategies = []

  // Load active strategies
  try {
    activeStrategies = await loadActiveStrategies()
  } catch (error) {
    console.log("Error loading active stategies: ", error);
  }

  // Fetch pair length
  try {
    pairLength = await Promise.all([factoryContract.methods.allPairsLength().call()])
  } catch (error) {
    console.log("Error fetching pairs length: ", error);
    return;
  }

  // Fetch pool info
  try {
    const [v2pools, gammaPools] = await Promise.all([
      pairAPIContract.methods
        .getAllPair(TEST_ACCOUNT, Number(pairLength), 0)
        .call(),
      fetchGammaInfo(activeStrategies),
    ]);
    poolInfos = [
      ...v2pools,
      ...gammaPools,
    ];
  } catch (error) {
    console.log("Error fetching Pool Info: ", error);
    return;
  }

  // Format pool info
  const pools = poolInfos.map((pool) => {
    const firstSymbol = pool.token0_symbol;
    const secondSymbol = pool.token1_symbol;
    const poolAddress = String(pool.pair_address).toLowerCase();
    const found = activeStrategies.find(
      (item) => item.address.toLowerCase() === poolAddress,
    );
    const poolMeta = `${found?.type}`
    const symbol = found
      ? `${firstSymbol}/${secondSymbol}`
      : pool.stable
        ? `sAMM-${firstSymbol}/${secondSymbol}`
        : `vAMM-${firstSymbol}/${secondSymbol}`;
    return {
      title: found ? `${found.title}` : symbol,
      symbol,
      decimals: Number(pool.decimals),
      address: poolAddress,
      isFusion: !!found,
      type: found ? found.type : pool.stable ? 'Stable' : 'Volatile',
      totalSupply: fromWei(
        Number(pool.total_supply),
        Number(pool.decimals),
      ),
      token0Address: pool.token0,
      token0Symbol: firstSymbol,
      token0Decimals: Number(pool.token0_decimals),
      token0Reserve: fromWei(
        Number(pool.reserve0),
        Number(pool.token0_decimals),
      ),
      token1Address: pool.token1,
      token1Symbol: secondSymbol,
      token1Decimals: Number(pool.token1_decimals),
      token1Reserve: fromWei(
        Number(pool.reserve1),
        Number(pool.token1_decimals),
      ),
      gaugeAddress: pool.gauge,
      gaugeTotalSupply: fromWei(
        Number(pool.gauge_total_supply),
        Number(pool.decimals),
      ),
      gaugeFee: pool.fee,
      gaugeBribe: pool.bribe,
      gaugeRewardPerSecond: fromWei(
        Number(pool.emissions),
        Number(pool.emissions_token_decimals),
      ),
      poolMeta
    };
  });

  let periodFinishes;
  try {
    periodFinishes = await fetchPeriodFinish(pools);
  } catch (error) {
    console.log(`Gauge Period Finish Fetch Error: ${error}`);
    return;
  }
  let poolExtraRewrards;
  try {
    poolExtraRewrards = await fetchExtraPoolRewards(pools);
  } catch (error) {
    console.log(`Extra Rewards Fetch Error: ${error}`);
    return;
  }

  // Get tokens 
  const tokens = [];
  try {
    pools.map((pool) => {
      if (!tokens.includes(pool.token0Address.toLowerCase())) {
        tokens.push(pool.token0Address.toLowerCase())
      }
      if (!tokens.includes(pool.token1Address.toLowerCase())) {
        tokens.push(pool.token1Address.toLowerCase())
      }
    })
  } catch {
    console.log("Error getting the pools tokens: ", error);
    return;
  }

  // Fetch token prices
  let prices;
  try {
    prices = await getPrices(tokens)
  } catch {
    console.log("Error getting the token's prices: ", error);
    return;
  }

  // Put all together
  const aux = pools.map((pool, i) => {
    let tvl;
    let rewardsTokens = [olynxAddress];
    let extraRewardsApy = 0
    let fusionSymbol = '';
    let gaugeTvl = new BigNumber(0)

    // Get TVL
    try {
      const asset0Price = !pool.token0Address ? 0 : prices.get(pool.token0Address.toLowerCase());
      const asset1Price = !pool.token1Address ? 0 : prices.get(pool.token1Address.toLowerCase());
      if (asset0Price && asset1Price && asset0Price > 0 && asset1Price > 0) {
        tvl = pool.token0Reserve.times(asset0Price || 0).plus(pool.token1Reserve.times(asset1Price));
      } else if (asset0Price > 0) {
        tvl = pool.token0Reserve.times(asset0Price).times(2);
      } else if (asset1Price > 0) {
        tvl = pool.token1Reserve.times(asset1Price).times(2);
      } else {
        tvl = new BigNumber(0);
      }
      const lpPrice = pool.totalSupply.isZero() ? new BigNumber(0) : tvl.div(pool.totalSupply);
      gaugeTvl = pool.gaugeTotalSupply.times(lpPrice);
    } catch {
      console.log('Error while calculating TVL');
    }

    // Get Extra Rewards
    if (poolExtraRewrards[i].length > 0) {
      poolExtraRewrards[i].forEach((extraReward) => {
        try {
          rewardsTokens.push(extraReward.tokenAddress)
          const rewardPrice = prices.get(extraReward.tokenAddress.toLowerCase());
          const rewardPerSecond = fromWei(extraReward.rewardRate.toString());
          const apr = gaugeTvl.isZero() || extraReward.isFinished
            ? 0
            : rewardPerSecond
              .times(rewardPrice)
              .times(86400 * 365)
              .div(gaugeTvl)
              .times(100)
              .toNumber();
          extraRewardsApy += apr
        } catch {
          console.log('Error while calculating Extra Rewards: ' + extraReward);
        }
      });
    }

    // Get APY
    let apy = 0;
    try {
      if (!gaugeTvl.isZero() && !periodFinishes[i] && prices) {
        apy = pool.gaugeRewardPerSecond
          .times(prices.get(lynxAddress))
          .times(86400 * 365)
          .div(gaugeTvl)
          .times(100)
          .toNumber()
      }
    } catch {
      console.log('Error while calculating APY');
    }

    return {
      pool: `${pool.address}-lynex-fusion`,
      chain: utils.formatChain('linea'),
      project: 'lynex-fusion',
      symbol: pool.symbol,
      tvlUsd: tvl.toNumber(),
      apyBase: apy,
      apyReward: extraRewardsApy,
      rewardTokens: rewardsTokens,
      underlyingTokens: [pool.token0Address, pool.token1Address],
      poolMeta: pool.poolMeta ?? null
    };

  });
  // const returnData = aux.filter((pool) => { return pool.tvlUsd > 500000 })
  return aux;
};

module.exports = {
  timetravel: false,
  apy: getApy,
  url: 'https://app.lynex.fi/liquidity',
};
