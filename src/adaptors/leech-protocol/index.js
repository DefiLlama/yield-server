const utils = require('../utils');
const superagent = require('superagent');

const { urlPCPD, CHAINS, POOLS } = require('./data')

// function make pool symbols string
const makePoolSymbol = (stablecoins, pool) => {
  let coin0 = ""
  let coin1 = ""
  if (pool.token0CoingeckoId !== undefined) {
    const coin = stablecoins.find(x => x.gecko_id.toLowerCase() == pool.token0CoingeckoId.toLowerCase())
    if (coin != undefined) {
      coin0 = coin.symbol
    }
  }
  if (pool.token1CoingeckoId !== undefined) {
    const coin = stablecoins.find(x => x.gecko_id.toLowerCase() == pool.token1CoingeckoId.toLowerCase())
    if (coin != undefined) {
      coin1 = coin.symbol
    }
  }
  if (coin0=="" && coin1=="") {
    const coin = CHAINS.find(x => x.chainId == pool.chainIndex)
    if (coin != undefined) {
      coin0 = coin.symbol
    }
  }
  return coin0 + (coin1!=''?'-':'') + coin1
}
// get APY
const apy = (chain, poolsAPRData, poolsLPData, stablecoins) => {
  const data = [];
  for(const pool of poolsLPData.items){
    const fnPoolId = POOLS.find(x => x.address.toLowerCase() == pool.address.toLowerCase())
    if (fnPoolId !== undefined) {
      const itemAPR = poolsAPRData.items.find(x => x.index == fnPoolId.index)
      if (itemAPR !== undefined) {
        const poolId = pool.address.toString() + '-' + chain.chain
        data.push({
            pool: poolId.toLowerCase(),
            chain: chain.chainName.toString(),
            project: 'leech-protocol',
            symbol: makePoolSymbol(stablecoins, pool),
            tvlUsd: Math.round(parseFloat(itemAPR.tvl)*100)/100,
            apy: Math.round(parseFloat(itemAPR.apr)*100)/100 + 25,
            apyBase: Math.round(parseFloat(itemAPR.apr)*100)/100,
            apyReward: 0,
            poolMeta: fnPoolId.poolMeta,
            rewardTokens: null
        });
      }
    } 
  }
  return data;
};

const main = async () => {
  const data = []
  // get stablecoins
  const stablecoins = (
    await superagent.get(
      'https://stablecoins.llama.fi/stablecoins'
    )
  ).body.peggedAssets.map((s) => {
    return {
      name: s.name,
      symbol: s.symbol,
      gecko_id: s.gecko_id,
    }
  });
  stablecoins.push({
    name: 'Wrapped USDT',
    symbol: 'WUSDR',
    gecko_id: 'wrapped-usdr',
  })
  // get APR and TVL data
  const poolsAPRData = await utils.getData(urlPCPD);
  // get pool GENERAL data by Chain ID
  for(const chain of CHAINS){
    const poolsLPData = await utils.getData(urlPCPD + '/lama/' + chain.chainId.toString());
    const newPools = apy(chain, poolsAPRData, poolsLPData, stablecoins)
    newPools.forEach((item) => data.push(item))
  }

  return data;
};

module.exports = {
  timetravel: false,
  apy: main,
  url: 'https://app.leechprotocol.com/pools',
};
