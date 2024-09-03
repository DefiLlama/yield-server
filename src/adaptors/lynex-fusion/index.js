const utils = require('../utils');
const BigNumber = require('bignumber.js');
const { Web3 } = require('web3');
const pairAPI = require('./abis/pairAPI.json');
const factoryAbi = require('./abis/factoryABI.json');
const { getTokenPrice, fetchPeriodFinish, fetchExtraPoolRewards } = require('./utils');

const TVL_FILTER = 10000
const TEST_ACCOUNT = '0x1111110000000000000000000000000000000000'

const getApy = async () => {
  const web3 = new Web3('https://provider.com');
  const pairAPIContract = new web3.eth.Contract(pairAPI, '0x6c84329CC8c37376eb32db50a17F3bFc917c3665');
  const factoryContract = new web3.eth.Contract(factoryAbi, '0xBc7695Fd00E3b32D08124b7a4287493aEE99f9ee');
  let pairLength = 0;
  let poolInfos;
  const fusions = await utils.getData('https://api.lynex.fi/api/v1/fusions');
  if (fusions) {
    const filteredFusions = fusions.data.filter(
      (fusion) => fusion.gauge.tvl > TVL_FILTER
    );

    // Fetch pair length
    try {
      pairLength = await Promise(factoryContract.methods.allPairsLength().call())
    } catch (error) {

    }
    // Fetch pool info
    try {
      poolInfos = await pairAPIContract.methods.getAllPair(TEST_ACCOUNT, pairLength, 0).call()
    } catch (error) {
      console.log("Error fetching Pool Info: ", error);
      return;
    }

    const pools = poolInfos.map((pool) => {
      const firstSymbol = getRealSymbol(pool[6]) || pool[7];
      const secondSymbol = getRealSymbol(pool[11]) || pool[12];
      const poolAddress = String(pool[0]).toLowerCase();
      const symbol = `${firstSymbol}/${secondSymbol}`
      return {
        symbol,
        decimals: Number(pool[3]),
        address: poolAddress,
        title: symbol,
        totalSupply: fromWei(Number(pool[5]), Number(pool[3])),
        token0Address: pool[6],
        token0Symbol: firstSymbol,
        token0Decimals: Number(pool[8]),
        token0Reserve: fromWei(Number(pool[9]), Number(pool[8])),
        token1Address: pool[11],
        token1Symbol: secondSymbol,
        token1Decimals: Number(pool[13]),
        token1Reserve: fromWei(Number(pool[14]), Number(pool[13])),
        gaugeAddress: pool[16],
        gaugeTotalSupply: fromWei(Number(pool[17]), Number(pool[3])),
        gaugeFee: pool[18],
        gaugeBribe: pool[19],
        gaugeRewardPerSecond: fromWei(Number(pool.emissions), Number(pool.emissions_token_decimals)),
      };
    });

    let periodFinishes;
    try {
      periodFinishes = await fetchPeriodFinish(pools);
    } catch (error) {
      logger.error(`Gauge Period Finish Fetch Error: ${JSON.stringify(error, Object.getOwnPropertyNames(error))}`);
      return;
    }
    let poolExtraRewrards;
    try {
      poolExtraRewrards = await fetchExtraPoolRewards(pools);
    } catch (error) {
      logger.error(`Extra Rewards Fetch Error: ${JSON.stringify(error, Object.getOwnPropertyNames(error))}`);
      return;
    }

    const returnData = pools.map((pool) => {
      let tvl;
      let rewardsTokens = ['0x63349ba5e1f71252ecd56e8f950d1a518b400b60'];
      let rewardsApy = pool.gaugeRewardPerSecond;
      let extraRewardsApy = 0
      let fusionSymbol = '';

      // Get TVL
      try {
        const asset0Price = !asset0 ? 0 : getTokenPrice(pool.token0Address.toLowerCase());
        const asset1Price = !asset1 ? 0 : getTokenPrice(pool.token1Address.toLowerCase());
        if (asset0Price > 0 && asset1Price > 0) {
          tvl = pool.token0Reserve.times(asset0Price || 0).plus(pool.token1Reserve.times(asset1Price));
        } else if (asset0Price > 0) {
          tvl = pool.token0Reserve.times(asset0Price).times(2);
        } else if (asset1Price > 0) {
          tvl = pool.token1Reserve.times(asset1Price).times(2);
        } else {
          tvl = new BigNumber(0);
        }
        const lpPrice = pool.totalSupply.isZero() ? new BigNumber(0) : tvl.div(pool.totalSupply);
        const gaugeTvl = pool.gaugeTotalSupply.times(lpPrice);

      } catch {
        console.log('Error while calculating TVL');
      }

      // Get Extra Rewards
      if (poolExtraRewrards.result[i].length > 0) {
        try {
          poolExtraRewrards.result[i].forEach((extraReward) => {
            rewardsTokens.push(extraReward.tokenAddress)
            const rewardPrice = getTokenPrice(extraReward.tokenAddress.toLowerCase());
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
          });
        } catch {
          console.log('Error while calculating Extra Rewards');
        }
      }

      try {        
        return {
          pool: `${pool.symbol}-${pool.address}-linea`,
          chain: utils.formatChain('linea'),
          project: 'lynex-fusion',
          symbol: pool.symbol,
          tvlUsd: tvl,
          apyBase: rewardsApy,
          apyReward: extraRewardsApy,
          rewardTokens: rewardsTokens.length > 0 ? rewardsTokens : null,
          underlyingTokens: [pool.token0.address, pool.token1.address],
        };
      } catch {
        console.log('Oops! Something went wrong...');
        return null;
      }
    });
    return returnData;
  }
  console.log('Error while fetching fusions');
  return null;
};

module.exports = {
  timetravel: false,
  apy: getApy,
  url: 'https://app.lynex.fi/liquidity',
};
