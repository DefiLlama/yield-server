const { parseAddress } = require('../../helper/starknet');
const axios = require('axios');


const strk ='0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d';
const slup = 'nimbora-yield';
const chain = 'Starknet'
const api = 'https://stats.nimbora.io/yield-dex/strategies'

async function apy() {
  const config = {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
    }
  };
  
  try {
    const response = await axios.get(api, config);
  return response.data.map((strategy) => {
    const underlyingToken =  parseAddress(strategy.underlying);
    const underlyingTokenSymbol =  strategy.underlyingSymbol
    const tokenManager = parseAddress(strategy.tokenManager);
    const pool = (tokenManager + '-starknet').toLowerCase();
    const apyBase = +strategy.aprBreakdown.base;
    const apyReward = +strategy.aprBreakdown.boost + +strategy.aprBreakdown.incentives
    const tvlUsd = +strategy.tvl

      return {
        pool,
        project: slup,
        symbol: underlyingTokenSymbol,
        chain,
        apyBase: apyBase,
        apyReward: apyReward,
        rewardTokens: apyReward !== 0 ? [strk] : [],
        tvlUsd,
        underlyingTokens: [underlyingToken],
        url: 'https://app.nimbora.io/',
        poolMeta: strategy.symbol,
      };
    })
  } catch (error) {
    console.error('Error:', error);
  }
}

module.exports = {
  apy,
  url: 'https://app.nimbora.io/',
};
