const ethers = require('ethers');
const axios = require('axios');
const utils = require('../utils');
const BigNumber = require('bignumber.js');


const PAIR_ABI = require('./Pair');
const KAVA_RPC_URL = 'https://evm.data.equilibre.kava.io';
const EQUILIBRE_API_URL = 'https://api.equilibrefinance.com/api/v1/pairs';
const LLAMA_API_URL = 'https://coins.llama.fi/prices/current/'

const provider = new ethers.providers.JsonRpcProvider(KAVA_RPC_URL);

const getApyEquilibre = async () => {
  try {
    const poolsRes = await utils.getData(EQUILIBRE_API_URL);
    const pools = await Promise.all(poolsRes.data.map(async (pool) => {
      const pairContract = new ethers.Contract(pool.address, PAIR_ABI, provider);

      const token0Address = await pairContract.token0();
      const token1Address = await pairContract.token1();

      const pairReserves = await pairContract.getReserves();
      const decimals = await pairContract.decimals();
      let reserve0 = pairReserves._reserve0;
      let reserve1 = pairReserves._reserve1;      

      reserve0 = reserve0 / (10**decimals)
      reserve1 = reserve1 / (10**decimals)      

      const tokens = await pairContract.tokens()

      const token0llama = 'kava:'.concat(tokens[0])
      const token1llama = 'kava:'.concat(tokens[1])

      const token0PriceRes = await axios.get(`${LLAMA_API_URL}${token0llama}`);
      const token1PriceRes = await axios.get(`${LLAMA_API_URL}${token1llama}`);
      
      if (token0PriceRes.status !== 200 || token1PriceRes.status !== 200) {
        throw new Error('Failed to fetch token price');
      }

      const token0Price = token0PriceRes.data;
      const token1Price = token1PriceRes.data;

      let tvl = 0;

      if (token0Price.coins && token0Price.coins[token0llama] && token0Price.coins[token0llama].price &&
          token1Price.coins && token1Price.coins[token1llama] && token1Price.coins[token1llama].price &&
          reserve0 && reserve1) {

        console.log('token0Price', token0Price.coins[token0llama].price)
        console.log('token1Price', token1Price.coins[token1llama].price)
  
        const token0PriceBigNumber = new BigNumber(token0Price.coins[token0llama].price);
        const token1PriceBigNumber = new BigNumber(token1Price.coins[token1llama].price);

        if(token0PriceBigNumber && token0PriceBigNumber !== 0){
          tvl += reserve0 * token0PriceBigNumber.toNumber();
        }

        if(token1PriceBigNumber && token1PriceBigNumber !== 0){
          tvl += reserve1 * token1PriceBigNumber.toNumber();
        }

        if(tvl != 0 && (token0PriceBigNumber.toNumber() || token1PriceBigNumber.toNumber() == 0))
            tvl = Number(tvl) * 2

          
        console.log('tvl', tvl)

      }

      const apy = {
        pool: pool.address,
        chain: utils.formatChain('kava'),
        project: 'equilibre',
        symbol: `${pool.token0.symbol}-${pool.token1.symbol}`,
        tvlUsd: Number(tvl.toFixed(2)),
        apyReward: pool.apr,
        underlyingTokens: [token0Address, token1Address],
        rewardTokens: [pool.address], 
      };

      return apy;
    }));

    return pools;
  } catch (error) {
    console.error(`Error in getApyEquilibre: ${error}`);
    console.error(`Stack trace: ${error.stack}`);
    return null;
  }
};

module.exports = {
  timetravel: false,
  apy: getApyEquilibre,
  url: 'https://equilibrefinance.com/liquidity',
};
