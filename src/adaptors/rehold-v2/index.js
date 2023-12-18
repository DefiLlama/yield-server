const axios = require('axios');
const BN = require('bignumber.js');
const utils = require('../utils');

const SLUG = 'rehold-v2';
const POOL_META = 'Dual Investment';

const CHAINS = {
  1: 'ethereum',
  10: 'optimism',
  56: 'bsc',
  137: 'polygon',
  169: 'manta',
  8453: 'base',
  42161: 'arbitrum',
  43114: 'avalanche',
  59144: 'linea',
};

async function _apy(chainId) {
  // We're using similar to dYdx architecture - we accept deposits and do withdrawals to the users on initial chains (e.g. Ethereum) via Router,
  // but process trades on the side-chain (in the case of ReHold is Arbitrum Nova - https://nova.arbiscan.io/address/0xDe6B4964c4384BcDfA150a4A8bE9865C5b91E29C)
  // to avoid huge gas costs, and make some actions to be gas-free for users.
  // You can find detailed explanation about this architecture in Whitepaper V2: https://rehold.io/whitepaper-v2.pdf
  const { data: pools } = await axios.get(`https://app.rehold.io/api/v2/pools/${chainId}`);

  return Object.entries(pools).map(([symbol, metadata]) => {
    const [tokenA, tokenB] = metadata.underlyingTokens;

    return {
      pool: `${chainId}-${tokenA}-${tokenB}`,
      chain: utils.formatChain(CHAINS[chainId]),
      project: SLUG,
      symbol: symbol.replace('/', '-'),
      apyBase: new BN(metadata.feesUsd).times(365).div(metadata.tvlUsd).times(100).toNumber(),
      tvlUsd: new BN(metadata.tvlUsd).toNumber(),
      underlyingTokens: [tokenA, tokenB],
      poolMeta: POOL_META,
    };
  });
}

async function apy() {
  const pools = [];

  for (const chainId in CHAINS) {
    pools.push(...(await _apy(chainId)));
  }

  return pools;
}

module.exports = {
  timetravel: false,
  apy,
  url: 'https://app.rehold.io/?utm_source=DefiLlama',
};
