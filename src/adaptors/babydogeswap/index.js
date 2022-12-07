const { request, gql } = require('graphql-request');

const { getLpTokens } = require('./utils')
const utils = require('../utils');

const url =
  'https://graph-bsc-mainnet.babydoge.com/subgraphs/name/babydoge/faas';

const WEEKS_IN_YEAR = 52.1429;

const TOTAL_FEE = 0.003;
const LP_HOLDERS_FEE = 0.002;

const ZERO_FEE_PAIRS = ['0x0536c8b0c3685b6e3c62a7b5c4e8b83f938f12d1'];

const query = gql`
  {
    farms(first: 1000, block: {number: <PLACEHOLDER>}) {
      id
      APR
      totalStakedUsdValue
      isStakeTokenLpToken
      rewardToken {
        id
        symbol
      }
      stakeToken {
        id
        isLpToken
        symbol
        token0 {
          id
          symbol
        }
        token1 {
          id
          symbol
        }
      }
    }
  }
`;

const farmDataMapping = (entry, lpTokens) => {
  entry = { ...entry };
  entry['lpTokenInfo'] = entry.isStakeTokenLpToken
    ? lpTokens.find(
        ({ id }) =>
          id?.toLocaleLowerCase() === entry.stakeToken?.id?.toLocaleLowerCase()
      )
    : null;
  return entry;
};

const getLpFeesAndApr = (volumeUSD, volumeUSDWeek, liquidityUSD) => {
  const totalFees24h = volumeUSD * TOTAL_FEE;
  const totalFees7d = volumeUSDWeek * TOTAL_FEE;
  const lpFees24h = volumeUSD * LP_HOLDERS_FEE;
  const lpFees7d = volumeUSDWeek * LP_HOLDERS_FEE;

  const lpApr7d =
    liquidityUSD > 0
      ? (volumeUSDWeek * LP_HOLDERS_FEE * WEEKS_IN_YEAR * 100) / liquidityUSD
      : 0;
  return {
    totalFees24h,
    totalFees7d,
    lpFees24h,
    lpFees7d,
    lpApr7d: lpApr7d !== Infinity ? lpApr7d : 0,
  };
};

const farmApy = (entry) => {
  entry = { ...entry };
  const index = ZERO_FEE_PAIRS.findIndex((v) => v.toLocaleLowerCase() === entry.id.toLocaleLowerCase());
  if (index > -1 || !entry.lpTokenInfo || entry.lpTokenInfo.reserveUSD === '0') {
    entry['apy'] = 0;
    return entry;
  }

  const { lpApr7d } = getLpFeesAndApr(
    parseFloat(entry.lpTokenInfo.volumeUSD),
    parseFloat(entry.lpTokenInfo.volumeUSD_avg7d),
    parseFloat(entry.lpTokenInfo.reserveUSD)
  );

  entry['apy'] = lpApr7d;
  return entry;
};

const main = async (timestamp = null) => {
  const [block, blockPrior] = await utils.getBlocks('bsc', timestamp, [url]);

  // pull data
  let queryC = query;
  let dataNow = await request(url, queryC.replace('<PLACEHOLDER>', block));
  dataNow = dataNow.farms;

  // get lp tokens
  let lpTokens = await getLpTokens(dataNow);

  // matching lp tokens to farms
  dataNow = dataNow.map((el) => farmDataMapping(el, lpTokens));

  // calculate APY
  const data = dataNow.map((el) => farmApy(el));
  console.log('data', data)

  const pools = data.map((p) => {
    let symbol;
    let underlyingTokens;
    // lp tokens
    if (p.stakeToken.isLpToken) {
      symbol = `${p.stakeToken.token0.symbol}-${p.stakeToken.token1.symbol}`;
      underlyingTokens = [p.stakeToken.token0.id, p.stakeToken.token1.id];

      // single staking
    } else {
      symbol = p.stakeToken.symbol;
      underlyingTokens = [p.stakeToken.id];
    }

    return {
      pool: p.id,
      chain: utils.formatChain('binance'),
      project: 'babydogeswap',
      symbol,
      tvlUsd: Number(p.totalStakedUsdValue),
      rewardTokens: [p.rewardToken.id],
      apyReward: Number(p.APR) * 100,
      apyBase: Number(p.apy),
      underlyingTokens,
      poolMeta: `Stake ${symbol}, Earn ${p.rewardToken.symbol}`
    };
  });

  return pools.filter((p) => p && utils.keepFinite(p));
};

module.exports = {
  timetravel: false,
  apy: main,
  url: 'https://babydogeswap.com/farms',
};
