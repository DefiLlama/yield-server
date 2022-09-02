const superagent = require('superagent');
const utils = require('../utils');

const chainsMapping = {
'aurora': 'aurora',
'avax': 'avalanche', 
'boba': 'boba', 
'bsc': 'binance',
'celo': 'celo', 
'cronos': 'cronos', 
'evmos': 'evmos', 
'fantom': 'fantom', 
'gnosis': 'xdai', 
'harmony': 'harmony', 
'heco': 'heco', 
'kcc': 'kcc', // TODO KCC
'moonbeam': 'moonbeam', 
'moonriver': 'moonriver', 
'oasis': 'oasis', 
'okc': 'okexchain', // todo need to fix naming :x - OKExChain
'polygon': 'polygon', 
'velas': 'velas', 
'wanchain': 'wanchain',
};

async function getAutofarmBuildId(){
  const homeUrl = 'https://autofarm.network/'
  const home = (await superagent.get(homeUrl)).text;
  const start = home.indexOf('"buildId":');
  return home.slice(start + 11, start + 32);
}

async function getPoolsMeta(){
  const buildId = await getAutofarmBuildId();
  const url = `https://autofarm.network/_next/data/${buildId}/index.json`
  return (await superagent.get(url)).body.pageProps.initialFarmDataByChain;
}

async function getPoolsApy(chain){
  chain = chain == "okc" ? "okex" : chain;
  chain = chain == "gnosis" ? "xdai" : chain;

  const poolsUrl = `https://static.autofarm.network/${chain}/farm_data_live.json`
  return (await superagent.get(poolsUrl)).body
}

function cleanLP(text){  
  return text.replace(" BLP", "").replace(" LP", "");
}

function autofarmApyItem(chain, item) {  
  console.log(item)
  return {
    pool: `autofarm-${item.pid}-${chain}`,
    chain: utils.formatChain(chain),
    project: 'autofarm',
    symbol: utils.formatSymbol(cleanLP(item.wantName)),
    poolMeta: item.farm, // TODO What should go here?
    tvlUsd: Number(item.poolWantTVL),
    apy: item.APY_total * 100,
  };
}

async function apy() {  
  const poolsMetaMeta = await getPoolsMeta();  
  
  // Iterate through chains
  const farmOfFarms = await Promise.all(Object.keys(chainsMapping).map(async (chain) => {
    const poolsApy = await getPoolsApy(chain);
    const poolsMeta = poolsMetaMeta[chain].pools   

    const pools = Object.keys(poolsMeta).filter((key)=> key!='tokens').map((key) => {
      return Object.assign({}, poolsMeta[key], poolsApy[key])      
      }
    )

    const activePools = pools.filter(
      (v) => v.allowDeposits
    );

    const farms = activePools.map((item) => {    
      return autofarmApyItem(chain, item);
    });
    return farms;
  }))  

  let output = [];
  farmOfFarms.map(farmList => {
    output = output.concat(farmList)
  })

  return output.filter((p) => utils.keepFinite(p));
}


module.exports = {
  timetravel: false,
  apy,
  url: 'https://autofarm.network/',
};
