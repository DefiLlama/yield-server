const axios = require('axios');
const sdk = require('@defillama/sdk');


const PROJECT_NAME = 'yeltoken';

const API_YEL_FINANCE_APR_URL = 'https://api.yel.finance/api/rest/v1/apr/potion/'
const API_YEL_FINANCE_TVL_URL = 'https://api.yel.finance/api/rest/v1/tvl/potion/' 

const POTIONS_URL = 'https://app.yel.finance/';

const SUPPORTED_CHAINS = {
  81457: 'Blast',
  8453 : 'Base'
};


const POTION_LIST = {
  81457: {
//                  Potion                          Potion Base token    
    '0x795a85CD543D0E2d29F7e11e33a20a38A4b5121e':         'WETH',  // lWETH / WETH
    '0x07BF0Bc908Ef4badF8ec0fB1f77A8dBFe33c33c0':         'BLAST', // lBLAST / Blast
    '0x7d2f5881F0C4B840fcFA2c49F4052d1A004eAf0d':         'YEL',   // lYEL / YEL
  },
  8453 : {
//                  Potion                          Potion Base token    
    '0x0540f15374eCF13aAB3c0a76b643333CE0D00579' :        'WETH',  // lWETH / WETH
    '0xE7349C94BDE0D13599Ed496342857bb231FeF02B' :        'USDC',  // lUSDC / USDC
    '0x516712404013200B499Cd8fAE4575E5d48F6Ba65' :        'YEL'    // lYEL / YEL
  }
};

const formatNumber = (n, decimals) => {
  return n / 10 ** decimals;
};

const getAPY = async () => {

  const APY_TASKS = []

  for( const chaindId of Object.keys(POTION_LIST)){
    for( const potionAddress of Object.keys(POTION_LIST[chaindId]) ){
        APY_TASKS.push(
          getData( { chainId : chaindId, potionAddress : potionAddress} )
        )
    }
  }
 
  return Promise.all(APY_TASKS);
};

const getData = async ({ chainId, potionAddress }) => {

  let apr_data = {}
  let tvl_data = {}

  try{
    apr_data = (await axios.get( `${API_YEL_FINANCE_APR_URL}${chainId}/${potionAddress}`)).data
    tvl_data  = (await axios.get( `${API_YEL_FINANCE_TVL_URL}${chainId}/${potionAddress}`)).data
  }catch( error){
    return undefined
  }

  return {
    chain: SUPPORTED_CHAINS[chainId],
    project: PROJECT_NAME,
    pool: `${chainId}-${potionAddress}`,
    symbol: POTION_LIST[chainId][potionAddress].replace('i', ''),
    apyBase: Number(apr_data.holderapr),
    tvlUsd: Number(tvl_data.tvl),
  };
  
};

module.exports = {
  apy: getAPY,
  url: POTIONS_URL,
};
