const sdk = require('@defillama/sdk');
const utils = require('../utils');
const abis = require('./takara-lend.json');
const ethers = require('ethers');

const markets_state = '0x4fFD2B969f883679c008838329d249E295aafC3C';
const chain = utils.formatChain('Sei');
const project = 'takara-lend';

function multiplyWithPrecision(a, aDecimals, b, bDecimals, resultDecimals = 18) {
  const scaleA = 10n ** BigInt(aDecimals);
  const scaleB = 10n ** BigInt(bDecimals);
  const scaleResult = 10n ** BigInt(resultDecimals);

  return (a * b * scaleResult) / (scaleA * scaleB);
}

function calculateApy(ratePerSecond, compoundingsPerYear) {
  ratePerSecond = BigInt(ratePerSecond);
  compoundingsPerYear = BigInt(compoundingsPerYear);

  if (ratePerSecond === 0n) return 0;

  const SCALE = BigInt(1e18);

  function pow(base, exponent) {
    let result = SCALE;
    let basePow = base;

    while (exponent > 0n) {
      if (exponent % 2n === 1n) {
        result = (result * basePow) / SCALE;
      }
      basePow = (basePow * basePow) / SCALE;
      exponent /= 2n;
    }

    return result;
  }
  const compounded = pow(SCALE + ratePerSecond, compoundingsPerYear);
  const rawData = (compounded - SCALE) * 100n;

  const data = ethers.utils.formatEther(rawData);
  return Number(data);
}

function yearly(emissionPerSec) {
  return emissionPerSec * 86400n * 365n;   // BigInt
}

function calcSubsidyPct(configs, supplyUsdFixed18, supplyTokenDec, oracleMap) {
  const bySymbol = new Map();         
    configs
    .filter((n) => BigInt(n.endTime) > BigInt(Math.floor(Date.now() / 1000)))
    .map((cfg) => {
      const oracle = oracleMap.get(cfg.emissionToken.toLowerCase());
      if (!oracle || cfg.supplyEmissionsPerSec === '0') return;

      const yearlyAmt   = yearly(BigInt(cfg.supplyEmissionsPerSec));  

      const yearlyUsd18 = multiplyWithPrecision(yearlyAmt, Number(oracle.decimals), BigInt(oracle.price), 18, 18n);

      const pct18 = (yearlyUsd18 * 100n * 10n ** 18n) / supplyUsdFixed18;

      const prev = bySymbol.get(oracle.symbol) || 0n;
      bySymbol.set(oracle.symbol, prev + pct18);
    });

    return Array.from(bySymbol.entries()).map(([name, pct18]) => ({
      name,
      value: Number(ethers.utils.formatEther(pct18, 18)),  
    }));
}

const apy = async () => {
  const {output:allMarketsMetadata} = (
    await sdk.api.abi.call({
      target: markets_state,
      abi: abis.find((m) => m.name === 'getActiveMarketsInfo'),
      chain: 'sei',
    })
  );
  const oracleMap = new Map();
  const rTokens = allMarketsMetadata.map((m)=> {
    oracleMap.set(m.underlying.toLowerCase(), {
      price:     BigInt(m.price),           // 18 位
      decimals:  Number(m.decimals),
      symbol:    m.underlyingSymbol,
    });
    return m.token;
  });

  const { output: partnerRaw } = await sdk.api.abi.multiCall({
    chain: 'sei',
    abi: abis.find(m => m.name === 'getPartnerRewardsAllMarketConfigs'),
    target: markets_state,
    calls: rTokens.map(t => ({ params: [t] })),
  });

  const { output: rewardsRaw } = await sdk.api.abi.multiCall({
    chain: 'sei',
    abi: abis.find(m => m.name === 'getRewardsAllMarketConfigs'),
    target: markets_state,
    calls: rTokens.map(t => ({ params: [t] })),
  });


  const pools = allMarketsMetadata.map((marketInfo, i) => {
    const pool = `${marketInfo.token}-${chain}`.toLowerCase();
    const underlyingSymbol = marketInfo.underlyingSymbol;

    const poolMeta = `Takara Lend ${underlyingSymbol} Market`;
    const tvlUsd = Number(ethers.utils.formatEther(marketInfo.tvl));
    const ltv = Number(ethers.utils.formatEther(marketInfo.ltv));
    const totalSupplyUsd = Number(
      ethers.utils.formatEther(marketInfo.totalSupply)
    );
    const totalBorrowUsd = Number(
      ethers.utils.formatEther(marketInfo.totalBorrows)
    );
    const borrowRatePerBlock = marketInfo.borrowRatePerBlock;
    const supplyRatePerBlock = marketInfo.supplyRatePerBlock;
    const timestampsPerYear = marketInfo.timestampsPerYear;

    const apyBase = calculateApy(supplyRatePerBlock, timestampsPerYear);
    const apyBaseBorrow = calculateApy(borrowRatePerBlock, timestampsPerYear);

    const url = `https://app.takaralend.com/market/${underlyingSymbol}`;


    const underlyingTot = multiplyWithPrecision(
      BigInt(marketInfo.orginTotalSupply),           
      Number(marketInfo.decimals),             
      BigInt(marketInfo.exchangeRateStored),    
      18,
      Number(marketInfo.decimals)     
    );
    
    const supplyUsdFixed = multiplyWithPrecision(
      underlyingTot,
      Number(marketInfo.decimals),
      BigInt(marketInfo.price),                 
      18,
      18                         
    );
    const rewards = rewardsRaw[i].output ||[];
    const partnerRewards = partnerRaw[i].output||[];

    let apyReward = 0;
    const SubsidyList = [];
    const rewardTokens = [];

    if(underlyingTot !== 0n || supplyUsdFixed !== 0n) {
        const rewardList  = calcSubsidyPct(
          rewards,
          supplyUsdFixed,
          Number(marketInfo.decimals),
          oracleMap,
        );
        const partnerList = calcSubsidyPct(
          partnerRewards,
          supplyUsdFixed,
          Number(marketInfo.decimals),
          oracleMap,
        );
        const allSubsidy  = [...partnerList, ...rewardList];
        apyReward = Number(allSubsidy.reduce((acc, item) => acc + item.value, 0).toFixed(2));
        const tokens = [...new Set([ ...partnerList, ...rewardList ].map(o => o.name))];
        allMarketsMetadata.forEach(item=>{
          if(tokens.includes(item.underlyingSymbol)){
            rewardTokens.push(item.underlying)
          }
        })
    }

    return {
      pool,
      chain,
      project,
      poolMeta,
      ltv,
      tvlUsd,
      totalSupplyUsd,
      totalBorrowUsd,
      apyBase,
      apyBaseBorrow,
      apyReward: apyReward,
      rewardTokens: rewardTokens,
      symbol: underlyingSymbol,
      underlyingTokens: [marketInfo.underlying],    
      url,
    };
  });

  return pools;
};

module.exports = {
  timetravel: false,
  apy: apy,
  url: 'https://app.takaralend.com',
};
