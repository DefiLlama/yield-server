const ethers = require('ethers');
const axios = require('axios');
const utils = require('../utils');

// Import the Pair ABI
const PAIR_ABI = require('./Pair');

const KAVA_RPC_URL = 'https://evm.data.equilibre.kava.io';
const COINGECKO_API = 'https://api.coingecko.com/api/v3/simple/price';
const EQUILIBRE_COINGECKO_ID = 'equilibre';
const EQUILIBRE_API_URL = 'https://api.equilibrefinance.com/api/v1/pairs';

const provider = new ethers.providers.JsonRpcProvider(KAVA_RPC_URL);

const getApyEquilibre = async () => {
  try {
    const poolsRes = await utils.getData(EQUILIBRE_API_URL);

    const token0PriceData = await axios.get(`${COINGECKO_API}?ids=${EQUILIBRE_COINGECKO_ID}&vs_currencies=usd`);
    const token1PriceData = await axios.get(`${COINGECKO_API}?ids=${EQUILIBRE_COINGECKO_ID}&vs_currencies=usd`);
    const token0Price = token0PriceData.data[EQUILIBRE_COINGECKO_ID].usd;
    const token1Price = token1PriceData.data[EQUILIBRE_COINGECKO_ID].usd;
    
    const pools = await Promise.all(poolsRes.data.map(async (pool) => {
      const pairContract = new ethers.Contract(pool.address, PAIR_ABI, provider);

      const token0Address = await pairContract.token0();
      const token1Address = await pairContract.token1();

      const reserves = await pairContract.getReserves();
      const reserve0 = reserves._reserve0;
      const reserve1 = reserves._reserve1;
     
      const tvl = reserve0 * token0Price + reserve1 * token1Price;


      const apy = {
        pool: pool.address,
        chain: utils.formatChain('kava'),
        project: 'equilibre',
        symbol: `${pool.token0.symbol}-${pool.token1.symbol}`,
        tvlUsd: tvl,
        apyReward: pool.apr,
        underlyingTokens: [token0Address, token1Address],
        rewardTokens: [pool.address], 
      }


      return apy;
    }));

    return pools

  }  catch (error) {
    return null;
  }
};

module.exports = {
  timetravel: false,
  apy: getApyEquilibre,
  url: 'https://equilibrefinance.com/liquidity',
};
