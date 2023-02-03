const superagent = require('superagent');
const sdk = require('@defillama/sdk');
const abi = require('./abi.js');

const main = async () => {
  const gammatrollerAddress = '0x1e0c9d09f9995b95ec4175aaa18b49f49f6165a3';
  const rewardAddress = '0xb3cb6d2f8f2fde203a022201c81a96c167607f15';
  const key = 'bsc:0xbb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c';
  const gammakey = 'bsc:0xb3cb6d2f8f2fde203a022201c81a96c167607f15';
  const bnbPriceUSD = (
    await superagent.post('https://coins.llama.fi/prices').send({
      coins: [key],
    })
  ).body.coins[key].price;

  const gammaPriceUSD = (
    await superagent.post('https://coins.llama.fi/prices').send({
      coins: [gammakey],
    })
  ).body.coins[gammakey].price;

  const data = (
    await superagent.get('https://aquaapi.planet.finance/getGreenPlanetMarkets')
  ).text;

  let markets = JSON.parse(data);

  const gammaSpeedsRes = await sdk.api.abi.multiCall({
    abi: abi.find((i) => i.name === 'gammaSpeeds'),
    calls: markets.map((t) => ({
      target: gammatrollerAddress,
      params: t.id,
    })),
    chain: 'bsc',
  });
  let gammaSpeeds = {};
  gammaSpeedsRes.output.map((o) => {
    gammaSpeeds[o.input.params[0]] = o.output
  });

  const getGammaBoostPercentageRes = await sdk.api.abi.multiCall({
    abi: abi.find((i) => i.name === 'getGammaBoostPercentage'),
    calls: markets.map((t) => ({
      target: gammatrollerAddress,
      params: t.id,
    })),
    chain: 'bsc',
  });
  let getGammaBoostPercentage = {};
  getGammaBoostPercentageRes.output.map((o) => {
    getGammaBoostPercentage[o.input.params[0]] = o.output
  });

  const pools = [];
  for (const p of markets) {

    let apyReward = 0; 
    let apyRewardBorrow = 0;
    const blocksPerDay = 28800;
    const daysPerYear = 365;
    let totalSupply = Number(p.totalSupply) * Number(p.exchangeRate);
    let totalBorrows = Number(p.totalBorrows) 
    let gammaPerBlock = ( 10000 - parseInt(getGammaBoostPercentage[p.id]) ) / 10000 * (Number(gammaSpeeds[p.id])/1e18);
    let gammaPerDay = gammaPerBlock * blocksPerDay;
    let gammaBorrowPerDay = (Number(gammaSpeeds[p.id])/1e18) * blocksPerDay;
    apyReward = 100 * (Math.pow(1 + (gammaPriceUSD * gammaPerDay) / (totalSupply * Number(p.underlyingPrice)), daysPerYear) - 1)
    apyRewardBorrow = 100 * (Math.pow(1 + (gammaPriceUSD * gammaBorrowPerDay) / (totalBorrows * Number(p.underlyingPrice)), daysPerYear) - 1)

    if(p.totalBorrows == 0) {
      apyRewardBorrow = 0;
    }
    let totalSupplyUsd = (Number(p.totalSupply) *
        Number(p.exchangeRate) ) *
        Number(p.underlyingPrice);
    let totalBorrowUsd = (Number(p.totalBorrows) * Number(p.underlyingPrice)) ;
    pools.push({
      pool: p.id,
      chain: 'BSC',
      project: 'green-planet',
      symbol: p.symbol.slice(1),
      tvlUsd: totalSupplyUsd - totalBorrowUsd,
      apyBase: (Math.pow((p.supplyRate) * blocksPerDay + 1, daysPerYear) - 1) * 100 ,
      apyReward,
      rewardTokens:
        apyReward > 0 ? ['0xb3cb6d2f8f2fde203a022201c81a96c167607f15'] : [],
      underlyingTokens: [p.underlyingAddress],
      // borrow fields
      apyBaseBorrow: (Math.pow((p.borrowRate) * blocksPerDay + 1, daysPerYear) - 1) * 100 ,
      apyRewardBorrow: apyRewardBorrow, 
      totalSupplyUsd: totalSupplyUsd,
      totalBorrowUsd: totalBorrowUsd,
      ltv: Number(p.collateralFactor),
    });
  }
  return pools;
};

module.exports = {
  timetravel: false,
  apy: main,
  url: 'https://app.planet.finance/lending',
};
