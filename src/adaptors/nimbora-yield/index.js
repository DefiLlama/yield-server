const { parseAddress } = require('../../helper/starknet');
const axios = require('axios');


const strk ='0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d';
const slup = 'nimbora-yield';
const chain = 'Starknet'

async function apy() {
    const resp = await fetch('https://backend.nimbora.io/yield-dex/strategies', {
    headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      }
  });

  const strategyData = await resp.json();

  return strategyData
    .map((strategy) => {

    const underlyingToken =  parseAddress(strategy.underlying);
    const underlyingTokenSymbol =  strategy.underlyingSymbol
    const tokenManager = parseAddress(strategy.tokenManager);
    const pool = (underlyingToken + '-starknet').toLowerCase();
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
      };
    })
}

module.exports = {
  apy,
  url: 'https://app.nimbora.io/',
};
