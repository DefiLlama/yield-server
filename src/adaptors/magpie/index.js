const sdk = require('@defillama/sdk');
const axios = require('axios');
const BigNumber = require('bignumber.js');
const utils = require('../utils');
const { POOL_LIST } = require('./pool');
const MasterMagpieABI = require('./abis/MasterMagpie.json');
const WombatPoolHelperABI = require('./abis/WombatPoolHelper.json');
const MasterWombatABI = require('./abis/MasterWombat.json');
const MultiRewarderPerSecABI = require('./abis/MultiRewarderPerSec.json');
const MasterMagpieAddress = '0xa3B615667CBd33cfc69843Bf11Fbb2A1D926BD46';
const MasterWombatAddress = '0xE2C07d20AF0Fb50CAE6cDD615CA44AbaAA31F9c8';
const WombatStakingAddress = '0x664cc2BcAe1E057EB1Ec379598c5B743Ad9Db6e7';
const WOMAddress = '0xAD6742A35fB341A9Cc6ad674738Dd8da98b94Fb1';
const MWOMAddress = "0x027a9d301FB747cd972CFB29A63f3BDA551DFc5c";
const MGPAddress = '0xD06716E1Ff2E492Cc5034c2E81805562dd3b45fa';
const VLMGPAddress = "0x9B69b06272980FA6BAd9D88680a71e3c3BeB32c6";
const CHAIN = 'bsc';
const AddressZero = '0x0000000000000000000000000000000000000000';
function formatEther(value, unit = 18) {
  const result = BigNumber(value).div(BigNumber(10).pow(BigNumber(unit)));
  return result.toString();
}

const TOKEN_PRICE = [];

async function fetchCoingeckoPrice() {
  const reponse = await axios.get(
    `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=usd-coin,tether,binance-usd,dai,wombat-exchange,stader,helio-protocol-hay,pstake-finance,ankr,wbnb,pstake-staked-bnb,stader-bnbx,ankr-reward-bearing-stake,wombex,magpie`,
    {
      // proxy: {
      //   protocol: 'http',
      //   host: '127.0.0.1',

      //   port: 7890,
      // },
    }
  );

  return reponse.data;
}
async function loadPrices() {
  const body = await fetchCoingeckoPrice();
  for (let item of body) {
    TOKEN_PRICE[item.symbol.toUpperCase()] = item.current_price;
    switch (item.symbol.toUpperCase()) {
      case 'WOM': {
        TOKEN_PRICE['MWOM'] = item.current_price;

        break;
      }
      case 'MGP': {
        TOKEN_PRICE['VLMGP'] = item.current_price;
      }
    }
  }
}

function getPrice(tokenSymbol) {
  return TOKEN_PRICE[tokenSymbol.toUpperCase()];
}

async function getWombatPoolId(pool) {
  const pid = (
    await sdk.api.abi.call({
      target: pool.helper,
      chain: CHAIN,
      abi: WombatPoolHelperABI.find((n) => n.name === 'pid'),
      params: [],
    })
  ).output;
  return pid;
}

async function getWombatPoolInfoByPid(pid) {
  const wombatPool = (
    await sdk.api.abi.call({
      target: MasterWombatAddress,
      chain: CHAIN,
      abi: MasterWombatABI.find((n) => n.name === 'poolInfo'),
      params: [pid],
    })
  ).output;
  return wombatPool;
}

async function getWombatPoolUserInfo(pid) {
  const userInfo = (
    await sdk.api.abi.call({
      target: MasterWombatAddress,
      chain: CHAIN,
      abi: MasterWombatABI.find((n) => n.name === 'userInfo'),
      params: [pid, WombatStakingAddress],
    })
  ).output;
  return userInfo;
}
let WombatTotalAllocPoint = null;
async function getWombatTotalAllocPoint() {
  if (WombatTotalAllocPoint) {
    return Wom
  }
  const totalAllocPoint = (
    await sdk.api.abi.call({
      target: MasterWombatAddress,
      chain: CHAIN,
      abi: MasterWombatABI.find((n) => n.name === 'totalAllocPoint'),
      params: [],
    })
  ).output;
  return totalAllocPoint;
}

async function getWombatWomPerSec() {
  const womPerSec = (
    await sdk.api.abi.call({
      target: MasterWombatAddress,
      chain: CHAIN,
      abi: MasterWombatABI.find((n) => n.name === 'womPerSec'),
      params: [],
    })
  ).output;
  return womPerSec;
}

async function balanceOf(tokenAddress, userAddress) {
  const result = (
    await sdk.api.abi.call({
      target: tokenAddress,
      chain: CHAIN,
      abi: 'erc20:balanceOf',
      params: [userAddress],
    })
  ).output;
  return result;
}

async function getWombatPoolRewardLength(rewarder) {
  const result = (
    await sdk.api.abi.call({
      target: rewarder,
      chain: CHAIN,
      abi: MultiRewarderPerSecABI.find((n) => n.name === 'rewardLength'),
      params: [],
    })
  ).output;
  return result;
}

async function getWombatPoolRewardInfo(rewarder, pid) {
  const result = (
    await sdk.api.abi.call({
      target: rewarder,
      chain: CHAIN,
      abi: MultiRewarderPerSecABI.find((n) => n.name === 'rewardInfo'),
      params: [pid],
    })
  ).output;
  return result;
}

async function getERC20TokenInfo(address) {
  const result = (
    await sdk.api.abi.call({
      target: address,
      chain: CHAIN,
      abi: 'erc20:symbol',
      params: [],
    })
  ).output;
  return {
    symbol: result,
  };
}

const WombatPoolInfo = {}
let WombatPoolRewardList = []
async function loadWombatPoolInfo() {
  WombatPoolRewardList.push({
    symbol: "WOM",
    address: WOMAddress,
    tokenPerSec: 0
  })
  for(let i = 0, l = POOL_LIST.length; i < l; i++) {
    const poolInfo = POOL_LIST[i]
    if (poolInfo.type == "WOMBAT_POOL") {

      const info = await getWombatPoolInfo(POOL_LIST[i]);
      // console.log(info)
      WombatPoolInfo[poolInfo.poolId] = info;
      WombatPoolRewardList[0].tokenPerSec = WombatPoolRewardList[0].tokenPerSec + info.emission;
      WombatPoolRewardList = WombatPoolRewardList.concat(info.rewardTokens)
    }
  }
}
async function getWombatPoolInfo(pool) {
  const pid = await getWombatPoolId(pool);
  const poolInfo = await getWombatPoolInfoByPid(pid);
  const userInfo = await getWombatPoolUserInfo(pid, WombatStakingAddress);
  const allocPoint = Number(poolInfo.allocPoint);
  const totalAllocPoint = Number(await getWombatTotalAllocPoint());
  const poolFactor = Number(formatEther(poolInfo.sumOfFactors));
  const userBalance = Number(formatEther(userInfo.amount));
  const userfactor = Number(formatEther(userInfo.factor));
  const womPerSec = Number(formatEther(await getWombatWomPerSec()));
  const lpTotalSupply = await balanceOf(poolInfo.lpToken, MasterWombatAddress)
  const totalSupply = Number(formatEther(lpTotalSupply));
  const emission = (womPerSec * allocPoint) / totalAllocPoint; // this value is the reward for the whole pool of this token in wombat
  const normPerSec = (emission * 0.375 * userBalance) / totalSupply;
  const boostedPerSec = (emission * 0.625 * userfactor) / poolFactor;
  const result = {
    lpToken: poolInfo.lpToken,
    pid: pid,
    allocPoint: allocPoint,
    totalAllocPoint,
    emission: normPerSec + boostedPerSec,
    userBalance,
    rewardTokens: [],
  };
  const rewarder = poolInfo.rewarder;
  if (rewarder != AddressZero) {
    const rewardLength = Number(await getWombatPoolRewardLength(rewarder));
    for (let i = 0; i < rewardLength; i++) {
      const rewardInfo = await getWombatPoolRewardInfo(rewarder, i);
      if (Number(rewardInfo.tokenPerSec) != 0) {
        const rewardToken = rewardInfo.rewardToken;
        const erc20Info = await getERC20TokenInfo(rewardToken);
        result.rewardTokens.push({
          address: rewardToken,
          symbol: erc20Info.symbol,
          tokenPerSec: rewardInfo.tokenPerSec,
          totalSupply: lpTotalSupply,
          userBalance: userInfo.amount
        });
      }
      // console.log(rewardInfo)
    }
  }
  return result;
}



async function getMGPApr(pool) {
  const newPoolInfo = (
    await sdk.api.abi.call({
      target: MasterMagpieAddress,
      chain: CHAIN,
      abi: MasterMagpieABI.find((n) => n.name === 'getPoolInfo'),
      params: [pool.rawStakingToken],
    })
  ).output;

  const numerator = new BigNumber(formatEther(newPoolInfo.emission)).multipliedBy(365).multipliedBy(24).multipliedBy(60).multipliedBy(60);
  const denominator = new BigNumber(formatEther(newPoolInfo.sizeOfPool));
  const mgpPrice = getPrice('MGP');
  const stakeTokenPrice = getPrice(pool.stakingTokenInfo.showSymbol);

  const numeratorAmount = numerator.multipliedBy(mgpPrice);
  const denominatorAmount = denominator.multipliedBy(stakeTokenPrice);
  const apr = numeratorAmount.dividedBy(denominatorAmount);
  return [
    {
      symbol: pool.type == "WOMBAT_POOL" ? "vlMGP": 'MGP',
      address: pool.type == "WOMBAT_POOL" ? VLMGPAddress: MGPAddress,
      apr: apr.toNumber(),
      formatApr: `${apr.multipliedBy(100).toFixed(2)}%`,
      tvl: denominatorAmount.toNumber(),
    },
  ];
}

async function getWOMAndRwardApr(pool) {
  const wombatPool = WombatPoolInfo[pool.poolId];
  // console.log(wombatPool)
  const numerator = new BigNumber(wombatPool.emission).multipliedBy(365).multipliedBy(24).multipliedBy(60).multipliedBy(60).multipliedBy(0.8);
  const totalSupply = (
    await sdk.api.abi.call({
      target: pool.rawStakingToken,
      chain: CHAIN,
      abi: 'erc20:balanceOf',
      params: [MasterMagpieAddress],
    })
  ).output;

  const denominator = new BigNumber(formatEther(totalSupply));
  const numeratorAmount = numerator.multipliedBy(getPrice('WOM'));
  const denominatorAmount = denominator.multipliedBy(
    getPrice(pool.stakingTokenInfo.showSymbol)
  );
  const apr = numeratorAmount.dividedBy(denominatorAmount);
  const rewardAprs = [];
  rewardAprs.push({
    symbol: 'WOM',
    apr: apr.toNumber(),
    address: WOMAddress,
    formatApr: `${apr.multipliedBy(100).toFixed(2)}%`,
    tvl: denominatorAmount.toNumber(),
  });

  const lpTotalSupply = await balanceOf(
    wombatPool.lpToken,
    MasterWombatAddress
  );
  const lpDenominator = new BigNumber(formatEther(lpTotalSupply));
  const lpDenominatorAmount = lpDenominator.multipliedBy(
    getPrice(pool.stakingTokenInfo.showSymbol)
  );
  for (let rewardInfo of wombatPool.rewardTokens) {
    const numerator = new BigNumber(formatEther(rewardInfo.tokenPerSec)).multipliedBy(365).multipliedBy(24).multipliedBy(60).multipliedBy(60).multipliedBy(0.8);
    const numeratorAmount = numerator.multipliedBy(getPrice(rewardInfo.symbol));
    const apr = numeratorAmount.dividedBy(lpDenominatorAmount);
    rewardAprs.push({
      symbol: rewardInfo.symbol,
      address: rewardInfo.address,
      apr: apr.toNumber(),
      formatApr: `${apr.multipliedBy(100).toFixed(2)}%`,
      tvl: lpDenominatorAmount.toNumber(),
    });
  }
  return rewardAprs;
}

async function apy() {
  await loadPrices();
 // console.log(TOKEN_PRICE)
  await loadWombatPoolInfo();
 // console.log(WombatPoolInfo);
  const poolAprList = [];
  
  for(let i = 0, l = POOL_LIST.length; i < l; i++) {
    const poolInfo = POOL_LIST[i]
    let aprList = []
    const mgpApr = await getMGPApr(poolInfo)
    aprList = aprList.concat(mgpApr)
    if (poolInfo.type == "WOMBAT_POOL") {
      const womApr = await getWOMAndRwardApr(poolInfo);
     // console.log(womApr)
      aprList = aprList.concat(womApr)
    }
    else if (poolInfo.type == "MAGPIE_WOM_POOL" || poolInfo.type == "MAGPIE_VLMGP_POOL") {
      const totalSupply = await balanceOf(poolInfo.rawStakingToken,  MasterMagpieAddress);
      const denominator = new BigNumber(formatEther(totalSupply))
      const denominatorAmount = denominator.multipliedBy(getPrice(poolInfo.stakingTokenInfo.showSymbol))
      const coefficient = poolInfo.type == "MAGPIE_WOM_POOL" ? 0.12 : 0.08
      for(let i = 0, l = WombatPoolRewardList.length; i < l; i++) {
        const rewardInfo = WombatPoolRewardList[i];
        let apr = new BigNumber(0);
        if (rewardInfo.symbol == "WOM") {
          apr = new BigNumber(rewardInfo.tokenPerSec).multipliedBy(365).multipliedBy(24).multipliedBy(60).multipliedBy(60).multipliedBy(coefficient).multipliedBy(getPrice(rewardInfo.symbol)).dividedBy(denominatorAmount);
        }
        else {
          let numerator = new BigNumber(formatEther(rewardInfo.tokenPerSec)).multipliedBy(365).multipliedBy(24).multipliedBy(60).multipliedBy(60).multipliedBy(coefficient);
          if (rewardInfo.userBalance && rewardInfo.totalSupply) {
            numerator = numerator.multipliedBy(new BigNumber(formatEther(rewardInfo.userBalance))).dividedBy(new BigNumber(formatEther(rewardInfo.totalSupply)))
          }
          const numeratorAmount = numerator.multipliedBy(getPrice(rewardInfo.symbol))
          apr =  numeratorAmount.dividedBy(denominatorAmount)
        }
     
        aprList.push(
          {
            address: rewardInfo.address,
            symbol: rewardInfo.symbol,
            apr: apr.toNumber(),
            formatApr: `${apr.multipliedBy(100).toFixed(2)}%`,
            tvl: denominatorAmount.toNumber(),
        })
      }
    }
    let totalApr = new BigNumber(0);
    for(let i = 0, l = aprList.length; i < l; i++) {
      totalApr = totalApr.plus(new BigNumber(aprList[i].apr))
    }
    poolAprList.push({
      pool: poolInfo.type == "WOMBAT_POOL" ? `${poolInfo.type}-${poolInfo.wombatPoolType}-${poolInfo.stakingTokenInfo.showSymbol}`: `${poolInfo.type}-${poolInfo.stakingTokenInfo.showSymbol}`,
      project: "magpie",
      chain: utils.formatChain(CHAIN),
      symbol: poolInfo.stakingTokenInfo.showSymbol,
      tvlUsd: mgpApr[0].tvl,
      url: "https://magpiexyz.io/stake",
      // apy: totalApr.multipliedBy(100).toNumber(),
      apyReward: totalApr.multipliedBy(100).toNumber(),
      rewardTokens: aprList.map(item => item.address)
    })
    // return {
    //   totalApr: totalApr.toNumber(),
    //   formatTotalApr: totalApr.gt(new BigNumber(0))? totalApr.multipliedBy(100).toFixed(2): "0.0",
    //   items: aprList
    // }
    // console.log(POOL_LIST[i].stakingTokenInfo.showSymbol, `${totalApr.multipliedBy(100).toFixed(2)}%`, aprList.map(item => {
    //   return `${item.symbol} ${item.formatApr}`
    // }))
  }

  return poolAprList;
}

module.exports = {
  timetravel: false,
  apy,
};
