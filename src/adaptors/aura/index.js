const sdk = require('@defillama/sdk');
const utils = require('../utils');
const {
  boosterABI, 
  stakingABI, 
  miningABI, 
  virtualBalanceRewardPoolABI, 
  stashTokenABI, 
  lpTokenABI, 
  lpTokenABI2, 
  vaultABI 
} = require("./abis")
const _ = require("lodash");
const ethers = require('ethers');

const AURA_BOOSTER = "0xA57b8d98dAE62B26Ec3bcC4a365338157060B234"
const BALANCER_VAULT = "0xBA12222222228d8Ba445958a75a0704d566BF2C8"
const AURA_REWARDS_CALCULATOR = "0x744Be650cea753de1e69BF6BAd3c98490A855f52"

const AURA_ADDRESS = '0xC0c293ce456fF0ED870ADd98a0828Dd4d2903DBF'.toLowerCase();
const BAL_ADDRESS = '0xba100000625a3754423978a60c9317c58a424e3D'.toLowerCase();
const LDO_ADDRESS = "0x5A98FcBEA516Cf06857215779Fd812CA3beF1B32".toLowerCase()


const SECONDS_PER_YEAR = 60 * 60 * 24 * 365;
const chain = "ethereum"

// TODO support ARB pools
const main = async () => {
  const [AURA_SUPPLY, BALANCER_SUPPLY] = (await sdk.api.abi.multiCall({
    abi: 'erc20:totalSupply',
    calls: [{ target: AURA_ADDRESS }, { target: BAL_ADDRESS }]
  })).output.map(({ output }) => output)

  const poolLength = parseInt((await sdk.api.abi.call({ abi: boosterABI.filter(({ name }) => name === "poolLength")[0], target: AURA_BOOSTER, chain: chain })).output);
  const allAuraPools = (await sdk.api.abi.multiCall({
    abi: boosterABI.filter(({ name }) => name === "poolInfo")[0],
    calls: _.range(poolLength).map(index => ({
        target: AURA_BOOSTER,
        params: [index]
    }))
  })).output.map(({ output }) => output)
  const validPools = allAuraPools.filter(poolInfo => poolInfo.shutdown == false)
  const validPoolIds = validPools.map(poolInfo => allAuraPools.indexOf(poolInfo))
  const validPoolsLength = validPools.length

  const gaugeContracts = validPools.map(poolInfo => poolInfo.gauge)
  const lpTokens = validPools.map(poolInfo => poolInfo.lptoken)
  const stakingContracts = validPools.map(poolInfo => poolInfo.crvRewards)

  const gaugeLPBalances = (await sdk.api.abi.multiCall({
    abi: "erc20:balanceOf",
    calls: _.range(validPoolsLength).map(index => ({
        target: lpTokens[index],
        params: [gaugeContracts[index]]
    }))
  })).output.map(({ output }) => output)

  const allTokenKeys = [...lpTokens, AURA_ADDRESS, BAL_ADDRESS, LDO_ADDRESS]
    .map((i) => `${chain}:${i}`)
    .join(',')
    .toLowerCase();
  
  const tokenPrices = (
    await utils.getData(`https://coins.llama.fi/prices/current/${allTokenKeys}`)
  ).coins;


  const poolTVLs = _.range(validPoolsLength).map(i => {
    if (`${chain}:${lpTokens[i].toLowerCase()}` in tokenPrices) {
      return (gaugeLPBalances[i] / 1e18) * tokenPrices[`${chain}:${lpTokens[i].toLowerCase()}`].price
    } else {
      return 0
    }
  })

  const balRewardPerSecondRates = (await sdk.api.abi.multiCall({
    abi: stakingABI.filter(({ name }) => name === "rewardRate")[0],
    calls: _.range(validPoolsLength).map(i => ({
        target: stakingContracts[i]
    }))
  })).output.map(({ output }) => output)

  const balRewardPerYearRates = balRewardPerSecondRates.map(x => ethers.BigNumber.from(x).mul(SECONDS_PER_YEAR))  
  const auraRewardPerYearRates = (await sdk.api.abi.multiCall({
    abi: miningABI.filter(({ name }) => name === "convertCrvToCvx")[0],
    calls: _.range(validPoolsLength).map(i => ({
        target: AURA_REWARDS_CALCULATOR, 
        params: [balRewardPerYearRates[i]]
    }))
  })).output.map(({ output }) => output)
  const balAPYs = _.range(validPoolsLength).map(i => {
    if (poolTVLs[i] === 0) { return 0 }
      return ((balRewardPerYearRates[i].mul(ethers.utils.parseEther(tokenPrices[`${chain}:${BAL_ADDRESS.toLowerCase()}`].price.toString()).mul(100))) / 1e18) / poolTVLs[i] / 1e18
    }
  )
  const auraAPYs = _.range(validPoolsLength).map(i => ((auraRewardPerYearRates[i] / 1e18) * tokenPrices[`${chain}:${AURA_ADDRESS.toLowerCase()}`].price * 100) / (AURA_SUPPLY / 1e18)) //.mul(ethers.utils.parseEther(tokenPrices[`${chain}:${AURA_ADDRESS.toLowerCase()}`].price.toString())).mul(100).div(AURA_SUPPLY) / 1e18)

  const extraRewardLengths = (await sdk.api.abi.multiCall({
    abi: stakingABI.filter(({ name }) => name === "extraRewardsLength")[0],
    calls: _.range(validPoolsLength).map(i => ({
        target: stakingContracts[i]
    }))
  })).output.map(({ output }) => output)

  const balancerPoolIds = (await sdk.api.abi.multiCall({
    abi: lpTokenABI.filter(({ name }) => name === "getPoolId")[0],
    calls: _.range(validPoolsLength).map(i => ({
        target: lpTokens[i]
    }))
  })).output.map(({ output }) => output)

  // Some of the pools do not have `getPoolId` so we use an alternative method to get the pool id
  await Promise.all(_.range(validPoolsLength).map(async i => {
    if (balancerPoolIds[i]) { return }
    balancerPoolIds[i] = (await sdk.api.abi.call({ 
      abi: lpTokenABI2.filter(({ name }) => name === "POOL_ID")[0], 
      target: lpTokens[i], 
      chain,
    })).output;
  }))


  const balancerPoolTokenInfos = (await sdk.api.abi.multiCall({
    abi: vaultABI.filter(({ name }) => name === "getPoolTokens")[0],
    calls: _.range(validPoolsLength).map(i => ({
        target: BALANCER_VAULT,
        chain,
        params: [balancerPoolIds[i]]
    }))
  })).output.map(({ output }) => output)

  const underlyingTokens = _.range(validPoolsLength).map(i => balancerPoolTokenInfos[i].tokens.filter(token => token !== lpTokens[i]))

  const uniqueTokens = Array.from(new Set(_.flatten(underlyingTokens))) 
  const uniqueTokenSymbols = (await sdk.api.abi.multiCall({
    abi: "erc20:symbol",
    calls: uniqueTokens.map(target => ({
        target,
        chain,
    }))
  })).output.map(({ output }) => output)

  const tokenToSymbolMap = uniqueTokens.reduce((obj, token, index) => {
    obj[token] = uniqueTokenSymbols[index];
    return obj;
  }, {});


  const finalPools = await Promise.all(_.range(validPoolsLength).map(async i => {
    const data = {
      pool: lpTokens[i],
      chain: "Ethereum",
      project: "aura",
      symbol: underlyingTokens[i].map(token => tokenToSymbolMap[token]).join("-"),
      tvlUsd: poolTVLs[i],
      apyBase: auraAPYs[i] + balAPYs[i],
      apyReward: 0,
      underlyingTokens: underlyingTokens[i],
      rewardTokens: [ethers.utils.getAddress(AURA_ADDRESS), ethers.utils.getAddress(BAL_ADDRESS)],
      url: `https://app.aura.finance/#/1/pool/${validPoolIds[i]}`,
   }

   // There are not too many extra reward pools so we do individual calls to simplify
   for (let x = 0; x < extraRewardLengths[i]; x++) {
      const virtualBalanceRewardPool = (await sdk.api.abi.call({ 
        abi: stakingABI.filter(({ name }) => name === "extraRewards")[0], 
        target: stakingContracts[i], 
        chain,
        params: [x] 
      })).output;

      const extraRewardRate = (await sdk.api.abi.call({ 
        abi: virtualBalanceRewardPoolABI.filter(({ name }) => name === "rewardRate")[0], 
        target: virtualBalanceRewardPool, 
        chain,
      })).output;

      const extraRewardTotalSupply = (await sdk.api.abi.call({ 
        abi: virtualBalanceRewardPoolABI.filter(({ name }) => name === "totalSupply")[0], 
        target: virtualBalanceRewardPool, 
        chain,
      })).output;

      const stashToken = (await sdk.api.abi.call({ 
        abi: virtualBalanceRewardPoolABI.filter(({ name }) => name === "rewardToken")[0], 
        target: virtualBalanceRewardPool, 
        chain,
      })).output;

      const baseToken = (await sdk.api.abi.call({ 
        abi: stashTokenABI.filter(({ name }) => name === "baseToken")[0], 
        target: stashToken, 
        chain,
      })).output;

      if (![LDO_ADDRESS, AURA_ADDRESS].includes(baseToken.toLowerCase())) {
        // console.log(validPoolIds[i], "new reward token. please add support for", baseToken)
        continue;
      }

      const rewardRatePerYear = extraRewardRate * 86_400 * 365

      const rewardAPY = (rewardRatePerYear / (baseToken.toLowerCase() === AURA_ADDRESS ? AURA_SUPPLY : extraRewardTotalSupply)) * tokenPrices[`${chain}:${baseToken.toLowerCase()}`].price * 100
      data.rewardTokens.push(baseToken)
      data.apyReward += rewardAPY
   }
   return data
  }))

  return finalPools
};

module.exports = {
  timetravel: false,
  apy: main,
  url: 'https://app.aura.finance/',
};
