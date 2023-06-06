const utils = require('../utils');
const superagent = require('superagent');
const fetch = require('node-fetch');

const ENDPOINT = 'https://mero.finance/api/apys';

interface MeroPool {
  pool: string;
  chain: string;
  project: string;
  symbol: string;
  tvlUsd: number;
  apyBase?: number;
  apyReward?: number;
  rewardTokens?: Array<string>;
  underlyingTokens?: Array<string>;
}

interface PoolMetadata {
  symbol: string;
  underlying: string;
}

interface Apy {
  pool: string;
  apy: number;
  tvl: number;
}

const poolMetadata: Record<string, PoolMetadata> = {
  '0x4b45ADDfFa952bC7A81ffB73694287643915B050': {
    symbol: 'DAI',
    underlying: '0x6B175474E89094C44Da98b954EedeAC495271d0F',
  },
  '0x19C674f7679c33f5c0248D9F736b2726447c41cF': {
    symbol: 'ETH',
    underlying: '0x0000000000000000000000000000000000000000',
  },
  '0xEf251Ac05D180a0ffBcE8AE0FC65f175a09ae02f': {
    symbol: 'USDC',
    underlying: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
  },
  '0x90272940265f21D57A8F9317A8d04a624F063903': {
    symbol: 'USDT',
    underlying: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
  },
  '0x9492a8E34126eC4a8494bA77ec197d6De131d660': {
    symbol: 'FRAX',
    underlying: '0x853d955aCEf822Db058eb8505911ED77F175b99e',
  },
};

const getMeroApys = async (): Promise<Apy[]> => {
  return (await fetch(ENDPOINT)).json();
};

const getEthPriceUsd = async (): Promise<number> => {
  const key = 'ethereum:0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2';
  return (await superagent.get(`https://coins.llama.fi/prices/current/${key}`))
    .body.coins[key].price;
};

const getPools = async (): Promise<MeroPool[]> => {
  const [apys, ethPriceUsd] = await Promise.all([
    getMeroApys(),
    getEthPriceUsd(),
  ]);

  return apys.map((apy: Apy) => {
    const metadata = poolMetadata[apy.pool];
    return {
      pool: apy.pool,
      chain: 'Ethereum',
      project: 'mero',
      symbol: metadata.symbol,
      tvlUsd: metadata.symbol === 'ETH' ? apy.tvl * ethPriceUsd : apy.tvl,
      apyBase: apy.apy,
      apyReward: 0,
      underlyingTokens: [metadata.underlying],
      rewardTokens: [],
      url: `https://mero.finance/pool/mero${metadata.symbol}`,
    };
  });
};

module.exports = {
  timetravel: false,
  apy: getPools,
};
