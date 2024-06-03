const sdk = require('@defillama/sdk');
const BigNumber = require('bignumber.js');
const utils = require('../utils');
const _ = require("lodash");

const MagpieReaderABI = require('./abis/MagpieReader.json');
const config = require("./config");

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

function formatEther(value, unit = 18) {
  const result = BigNumber(value).div(BigNumber(10).pow(BigNumber(unit)));
  return result.toString();
}


async function getMagpieInfo() {
  const infos = [];
  for(let conf of config) {
    const result = (
      await sdk.api.abi.call({
        target: conf.contract.MagpieReaderAddress,
        chain: conf.chain,
        abi: MagpieReaderABI.find((n) => n.name === 'getMagpieInfo'),
        params: [ZERO_ADDRESS],
      })
    ).output;
    infos.push(
      {
        chain: conf.chain,
        masterMagpie: conf.contract.MasterMagpieAddress,
        result: result,
      }
    );
  }

  
  return infos;
}

async function apy() {
  const magpieInfos = await getMagpieInfo();
  const poolAprList = [];

  for(let info of magpieInfos) {
    const magpieInfo = info.result;
    const mgpAddress = magpieInfo.mgp;
    const vlmgpAddress = magpieInfo.vlmgp;
    const womAddress = magpieInfo.wom;

    const priceData = {};
    for (let item of magpieInfo.tokenPriceList) {
      priceData[item.symbol.toUpperCase()] = Number(formatEther(item.price));
    };
    priceData["VLMGP"] = priceData["MGP"];
    priceData["MWOM"] =  priceData["WOM"];
    priceData["MWOMSV"] =  priceData["WOM"];
    const wombatRewardTokens =  [];
    wombatRewardTokens.push({
      symbol: "WOM",
      tokenPerSec: 0,
      address: womAddress
    });

    let poolInfos = [];

    for(let i = 0, l = magpieInfo.pools.length; i < l; i++) {
      const rawInfo = magpieInfo.pools[i];
      if (rawInfo.isActive === false) {
        continue;
      }
      const pool = {
        type: rawInfo.poolType,
        poolId: Number(rawInfo.poolId),
        isNative:  rawInfo.poolType === "WOMBAT_POOL" ? rawInfo.wombatHelperInfo.isNative: false,
        wombatPoolType:  (rawInfo.poolType === "WOMBAT_POOL" && rawInfo.isActive) ? rawInfo.wombatV3Pool.poolType.replace(" ", "_").toUpperCase() : "",
        helper: rawInfo.helper,
        isActive: rawInfo.isActive,
        helperNeedsHarvest: rawInfo.helperNeedsHarvest,
        locker: rawInfo.poolType === "MAGPIE_VLMGP_POOL" ? rawInfo.helper: ZERO_ADDRESS ,
        rawStakingToken: rawInfo.stakingToken,
        stakingToken: rawInfo.poolType === "WOMBAT_POOL" ? rawInfo.wombatHelperInfo.depositToken :  (rawInfo.poolType === "MAGPIE_VLMGP_POOL" ? mgpAddress: rawInfo.stakingToken),
        rewarder: rawInfo.rewarder,
        isPoolFeeFree:(rawInfo.poolType === "WOMBAT_POOL" && rawInfo.isActive) ? rawInfo.wombatStakingPool.isPoolFeeFree : false,
        rawStakingTokenInfo: {
          name: rawInfo.stakingTokenSymbol,
          symbol: rawInfo.stakingTokenSymbol
        },
        stakingTokenInfo: rawInfo.poolType === "WOMBAT_POOL" ? {
          name: rawInfo.wombatHelperInfo.depositTokenSymbol,
          symbol: rawInfo.wombatHelperInfo.depositTokenSymbol,
          showSymbol: rawInfo.wombatHelperInfo.depositTokenSymbol,
          decimals: Number(rawInfo.wombatHelperInfo.depositTokenDecimals),
          priceId: rawInfo.wombatHelperInfo.depositTokenSymbol.toUpperCase()
        }: {
          name: rawInfo.stakingTokenSymbol,
          symbol: rawInfo.stakingTokenSymbol,
          showSymbol: rawInfo.stakingTokenSymbol,
          decimals: Number(rawInfo.stakingTokenDecimals),
          priceId: rawInfo.stakingTokenSymbol.toUpperCase()
        }
  
      }
      //console.log("pool", pool)
      if (rawInfo.poolType === "WOMBAT_POOL") {
        pool.helperInfo = {
          depositToken : rawInfo.wombatHelperInfo.depositToken,
          lpToken: rawInfo.wombatHelperInfo.lpToken,
          stakingToken: rawInfo.wombatHelperInfo.stakingToken,
        }
      }
    
      pool.tvlInfo = {
        totalSupply: rawInfo.sizeOfPool,
        formatTotalSupply: formatEther(rawInfo.sizeOfPool),
        totalAmount: new BigNumber(formatEther(rawInfo.sizeOfPool)).multipliedBy(priceData[pool.stakingTokenInfo?.showSymbol?.toUpperCase()]).toNumber(),
      }
      if (rawInfo.isActive) {
        pool.aprInfo = {
          totalApr: 0,
          formatTotalApr: "0.0",
          items: []
        }
        let rewardAmount = new BigNumber(formatEther(rawInfo.emission));
        rewardAmount = rewardAmount.multipliedBy(365).multipliedBy(24).multipliedBy(60).multipliedBy(60).multipliedBy(priceData["MGP"])
        const mgpApr = rewardAmount.dividedBy(new BigNumber(pool.tvlInfo.totalAmount))
        const mgpAprItem = {
          name: rawInfo.isMPGRewardPool ? "MGP": "vlMGP",
          symbol: rawInfo.isMPGRewardPool ? "MGP": "vlMGP",
          value: mgpApr.toNumber(),
          formatValue: mgpApr.gt(new BigNumber(0)) ? mgpApr.multipliedBy(100).toFixed(2): "0.0",
          address: rawInfo.isMPGRewardPool ? mgpAddress : vlmgpAddress,
        }
        pool.aprInfo.items.push(mgpAprItem)
       
        if (pool.type === "WOMBAT_POOL") {
          const poolFactor = Number(formatEther(rawInfo.wombatV3Pool.sumOfFactors));
          const userBalance = Number(formatEther(rawInfo.wombatV3Pool.wombatStakingUserAmount));
          const userfactor = Number(formatEther(rawInfo.wombatV3Pool.wombatStakingUserFactor));
          const totalSupply = Number(formatEther(rawInfo.wombatV3Pool.totalSupply));
          const rewardRate =  Number(formatEther(rawInfo.wombatV3Pool.rewardRate));
          const normPerSec = rewardRate * 0.375 * userBalance / totalSupply;
          const boostedPerSec = rewardRate * 0.625 * userfactor / poolFactor;
          const rewardAmount = new BigNumber(normPerSec + boostedPerSec).multipliedBy(365).multipliedBy(24).multipliedBy(60).multipliedBy(60).multipliedBy(pool.isPoolFeeFree ? 1 : 0.8).multipliedBy(priceData["WOM"]);
          wombatRewardTokens[0].tokenPerSec = wombatRewardTokens[0].tokenPerSec + normPerSec + boostedPerSec;
          const womApr = rewardAmount.dividedBy(new BigNumber(pool.tvlInfo.totalAmount))
          const womAprItem = {
            name:  "WOM",
            symbol: "WOM",
            value: womApr.toNumber(),
            formatValue: womApr.gt(new BigNumber(0)) ? womApr.multipliedBy(100).toFixed(2): "0.0",
            address: womAddress
          }
          pool.aprInfo.items.push(womAprItem)
          for(let i = 0, l = rawInfo.wombatV3Pool.rewardList.length; i < l; i++) {
            const rewardInfo =  rawInfo.wombatV3Pool.rewardList[i]
            if (Number(rewardInfo.tokenPerSec) === 0) {
              continue;
            }
            const rewardAmount = new BigNumber(formatEther(rewardInfo.tokenPerSec)).multipliedBy(365).multipliedBy(24).multipliedBy(60).multipliedBy(60).multipliedBy(pool.isPoolFeeFree ? 1 : 0.8).multipliedBy(priceData[rewardInfo.rewardTokenSymbol.toUpperCase()])
            const tvlAmount =  new BigNumber(formatEther(rawInfo.wombatV3Pool.totalSupply)).multipliedBy(priceData[rawInfo.wombatHelperInfo.depositTokenSymbol.toUpperCase()])
            const rewardApr = rewardAmount.dividedBy(tvlAmount)
            const rewardAprItem = {
              name:  rewardInfo.rewardTokenSymbol,
              symbol:rewardInfo.rewardTokenSymbol,
              value: rewardApr.toNumber(),
              formatValue: rewardApr.gt(new BigNumber(0)) ? rewardApr.multipliedBy(100).toFixed(2): "0.0",
              address: rewardInfo.rewardToken 
            }
            wombatRewardTokens.push({
              symbol:rewardInfo.rewardTokenSymbol,
              tokenPerSec: rewardInfo.tokenPerSec,
              totalSupply: rawInfo.wombatV3Pool.totalSupply,
              userBalance: rawInfo.wombatV3Pool.wombatStakingUserAmount,
              address: rewardInfo.rewardToken 
            })
            pool.aprInfo.items.push(rewardAprItem)
          }
        }
  
        let totalApr = new BigNumber(0);
        for(let i = 0, l = pool.aprInfo.items.length; i < l; i++) {
          totalApr = totalApr.plus(new BigNumber(pool.aprInfo.items[i].value))
        }
        pool.aprInfo.totalApr = totalApr.toNumber();
        pool.aprInfo.formatTotalApr =  new BigNumber(pool.aprInfo.totalApr).gt(new BigNumber(0))? new BigNumber(pool.aprInfo.totalApr).multipliedBy(100).toFixed(2): "0.0";
      }
      
      poolInfos.push(pool)
    }

    const magpieWomPool = _.find(poolInfos, (item) => {
      return item.type === "MAGPIE_WOM_POOL"
    })
    if (magpieWomPool && magpieWomPool.aprInfo) {
      for(let i = 0, l = wombatRewardTokens.length; i < l; i++) {
        const rewardInfo = wombatRewardTokens[i];
        let apr = new BigNumber(0);
        const tvl = new BigNumber(magpieWomPool.tvlInfo?.totalAmount)
        
        if (rewardInfo.symbol === "WOM") {
          apr = new BigNumber(rewardInfo.tokenPerSec).multipliedBy(365).multipliedBy(24).multipliedBy(60).multipliedBy(60).multipliedBy(0.12).multipliedBy(priceData["WOM"]).dividedBy(tvl);
        }
        else {
          //console.log(poolInfo, rewardInfo, rewardInfos)
          let rewardAmount = new BigNumber(formatEther(rewardInfo.tokenPerSec)).multipliedBy(365).multipliedBy(24).multipliedBy(60).multipliedBy(60).multipliedBy(0.12);
          if (rewardInfo.userBalance && rewardInfo.totalSupply) {
            rewardAmount = rewardAmount.multipliedBy(new BigNumber(formatEther(rewardInfo.userBalance))).dividedBy(new BigNumber(formatEther(rewardInfo.totalSupply)))
          }
          rewardAmount = rewardAmount.multipliedBy(priceData[rewardInfo.symbol.toUpperCase()])
          apr = rewardAmount.dividedBy(tvl)
        }
     
        magpieWomPool.aprInfo?.items.push(
          {
            name: rewardInfo.symbol,
            symbol: rewardInfo.symbol,
            value: apr.toNumber(),
            formatValue: apr.gt(new BigNumber(0))? apr.multipliedBy(100).toFixed(2): "0.0",
            address: rewardInfo.address
        })
      }
      let totalApr = new BigNumber(0);
      for(let i = 0, l = magpieWomPool.aprInfo.items.length; i < l; i++) {
        totalApr = totalApr.plus(new BigNumber(magpieWomPool.aprInfo?.items[i].value))
      }
      magpieWomPool.aprInfo.totalApr = totalApr.toNumber();
      magpieWomPool.aprInfo.formatTotalApr =  new BigNumber(magpieWomPool.aprInfo.totalApr).gt(new BigNumber(0))? new BigNumber(magpieWomPool.aprInfo.totalApr).multipliedBy(100).toFixed(2): "0.0";
    }
    const magpieVlMgpPool = _.find(poolInfos, (item) => {
      return item.type === "MAGPIE_VLMGP_POOL"
    })
    if (magpieVlMgpPool && magpieVlMgpPool.aprInfo) {
      for(let i = 0, l = wombatRewardTokens.length; i < l; i++) {
        const rewardInfo = wombatRewardTokens[i];
        let apr = new BigNumber(0);
        const tvl = new BigNumber(magpieVlMgpPool.tvlInfo?.totalAmount)
        if (rewardInfo.symbol === "WOM") {
          apr = new BigNumber(rewardInfo.tokenPerSec).multipliedBy(365).multipliedBy(24).multipliedBy(60).multipliedBy(60).multipliedBy(0.08).multipliedBy(priceData["WOM"]).dividedBy(tvl);
        }
        else {
          //console.log(poolInfo, rewardInfo, rewardInfos)
          let rewardAmount = new BigNumber(formatEther(rewardInfo.tokenPerSec)).multipliedBy(365).multipliedBy(24).multipliedBy(60).multipliedBy(60).multipliedBy(0.08);
          if (rewardInfo.userBalance && rewardInfo.totalSupply) {
            rewardAmount = rewardAmount.multipliedBy(new BigNumber(formatEther(rewardInfo.userBalance))).dividedBy(new BigNumber(formatEther(rewardInfo.totalSupply)))
          }
          rewardAmount = rewardAmount.multipliedBy(priceData[rewardInfo.symbol.toUpperCase()])
          apr = rewardAmount.dividedBy(tvl)
        }
     
        magpieVlMgpPool.aprInfo?.items.push(
          {
            name: rewardInfo.symbol === "WOM" ? "mWom": rewardInfo.symbol,
            symbol: rewardInfo.symbol === "WOM" ? "mWom": rewardInfo.symbol,
            value: apr.toNumber(),
            formatValue: apr.gt(new BigNumber(0))? apr.multipliedBy(100).toFixed(2): "0.0",
            address: rewardInfo.address
        })
      }
      let totalApr = new BigNumber(0);
      for(let i = 0, l = magpieVlMgpPool.aprInfo.items.length; i < l; i++) {
        totalApr = totalApr.plus(new BigNumber(magpieVlMgpPool.aprInfo?.items[i].value))
      }
      magpieVlMgpPool.aprInfo.totalApr = totalApr.toNumber();
      magpieVlMgpPool.aprInfo.formatTotalApr =  new BigNumber(magpieVlMgpPool.aprInfo.totalApr).gt(new BigNumber(0))? new BigNumber(magpieVlMgpPool.aprInfo.totalApr).multipliedBy(100).toFixed(2): "0.0";
    }
  
    for(let poolInfo of poolInfos) {
      //console.log(poolInfo)
      if (poolInfo.tvlInfo.totalAmount == 0) {
        continue;
      }
      poolAprList.push({
        pool: `${info.masterMagpie}-${poolInfo.poolId}`,
        project: "magpie",
        chain: utils.formatChain(info.chain),
        symbol: poolInfo.stakingTokenInfo.showSymbol,
        tvlUsd: poolInfo.tvlInfo.totalAmount,
        url: "https://magpiexyz.io/stake",
        underlyingTokens: [poolInfo.stakingToken],
        // apy: totalApr.multipliedBy(100).toNumber(),
        apyReward: new BigNumber(poolInfo.aprInfo.totalApr).multipliedBy(100).toNumber(),
        rewardTokens: poolInfo.aprInfo.items.map(item => item.address),
        poolMeta: poolInfo.type == "WOMBAT_POOL" ? "Wombat" : null
      })
    }
  }

  return poolAprList.filter(i => utils.keepFinite(i))
}

module.exports = {
  timetravel: false,
  apy,
};
