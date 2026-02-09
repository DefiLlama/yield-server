const axios = require('axios');
const utils = require('../utils');

const FARM_FEE = 0.04;
const apiBase = 'https://francium-data.s3-us-west-2.amazonaws.com/';

const SOLANA_TOKEN_MINTS = {
  SOL: 'So11111111111111111111111111111111111111112',
  USDC: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
  USDT: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB',
  RAY: '4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R',
  SRM: 'SRMuApVNdxXokk5GT7XD5cUUgXMBCoAz2LHeuAoKWRt',
  SAMO: '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU',
  mSOL: 'mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So',
  stSOL: '7dHbWXmci3dT8UFYWYZweBLXgycu7Y3iL6trKn1Y7ARj',
  ETH: '7vfCXTUXx5WJV5JADk17DUJ4ksgau7utNKj4b963voxs',
  BTC: '9n4nbM75f5Ui33ZbPYXn59EwSgE8CGsHtAeTH5YFeJ9E',
  ORCA: 'orcaEKTdK7LKz57vaAYr9QeNsVEPfiu6QeMU1kektZE',
  whETH: '7vfCXTUXx5WJV5JADk17DUJ4ksgau7utNKj4b963voxs',
};

function getUnderlyingTokens(symbolStr) {
  const parts = symbolStr.replace('$', '').split('-');
  const tokens = parts.map((s) => SOLANA_TOKEN_MINTS[s]).filter(Boolean);
  return tokens.length > 0 ? tokens : undefined;
}

function getFarmPoolAPY(target) {
  function aprToApy(apr, n = 365) {
    return (1 + apr / n) ** n - 1;
  }
  function getFarmAPY(yfAPR, tradingFeeAPR, bi) {
    return aprToApy(yfAPR * (1 - FARM_FEE) + tradingFeeAPR) - aprToApy(bi);
  }
  return (
    getFarmAPY(
      (3 * target.yieldFarmingAPR) / 100,
      (3 * target.tradingFeeAPR) / 100,
      (-2 * target.borrowAPR) / 100
    ) * 100
  );
}

async function getPoolsData() {
  const [{ data: farmPoolData }, { data: lendPoolData }] = await Promise.all([
    axios.get(apiBase + 'pools/latest.json'),
    axios.get(apiBase + 'lend/latest.json'),
  ]);

  if (!farmPoolData || !lendPoolData) {
    // console.log({farmPoolData, lendPoolData});
    throw new Error('Unexpected response from frcPoolsData');
    return;
  }

  const pools = [];

  const latestFarmPools = farmPoolData.filter((item) => item.poolId);
  const latestLendPools = lendPoolData.filter((item) => item.poolId);

  latestFarmPools.forEach((item) => {
    pools.push({
      pool: item.poolId,
      chain: utils.formatChain('solana'),
      project: 'francium',
      symbol: utils.formatSymbol(item.pool),
      tvlUsd: Number(item.frTvl),
      apyBase: getFarmPoolAPY(item),
      underlyingTokens: getUnderlyingTokens(item.pool),
      url: 'https://francium.io/app/invest/farm',
    });
  });

  latestLendPools.forEach((item) => {
    pools.push({
      pool: item.poolId,
      chain: utils.formatChain('solana'),
      project: 'francium',
      symbol: utils.formatSymbol(item.id),
      tvlUsd: Number(item.available),
      apyBase: item.apy,
      underlyingTokens: getUnderlyingTokens(item.id),
      url: 'https://francium.io/app/lend',
    });
  });

  return pools;
}

module.exports = {
  timetravel: false,
  apy: getPoolsData,
};
