const { request, gql } = require('graphql-request');

const utils = require('../utils');

const url = 'https://graph-bsc-mainnet.babydoge.com/subgraphs/name/babydoge/faas';
const info_url = 'https://graph-bsc-mainnet.babydoge.com/subgraphs/name/babydoge/exchange';

const WEEKS_IN_YEAR = 52.1429

const TOTAL_FEE = 0.0025
const LP_HOLDERS_FEE = 0.0017

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

const getLpTokens = async (farms) => {
  const week_ago = new Date()
  week_ago.setDate(week_ago.getDate() - 7)
  const week_ago_timestamp = Math.floor(week_ago.getTime() / 1000)
  const pairs = farms
    .filter((farm) => farm.isStakeTokenLpToken)
    .map((farm) => farm.stakeToken?.address)
  if (pairs.length > 0) {
    const lpQuery = gql`
    {
        ${pairs
        .map(
          (pair) => `
            p${pair}:pairDayDatas(
                where: {pairAddress: "${pair}", date_gt: ${week_ago_timestamp}}
                orderDirection: desc
                orderBy: date
            ) {
                dailyVolumeUSD
            }
            pd${pair}:pair(id: "${pair}") {
                name
                totalSupply
                reserveUSD
                volumeUSD
            }
            `,
        )
        .join('')}
    }`
    const data = await request(info_url, lpQuery)
    const keys = Object.keys(data).filter((key) => key.startsWith('pd'))
    const average = (arr) => arr.reduce((p, c) => p + Number(c.dailyVolumeUSD), 0) / arr.length
    const lpTokens = keys.map((key) => {
      const id = key.slice(2)
      const volumeUSD_avg7d = average(data[`p${id}`])
      return {
        ...data[key],
        id,
        volumeUSD_avg7d,
      }
    })
    return lpTokens
  }
  return []
}

const farmDataMapping = (entry, lpTokens) => {
  entry = { ...entry };
  entry['lpTokenInfo'] = entry.isStakeTokenLpToken ? lpTokens.find(
    ({ id }) => id?.toLocaleLowerCase() === entry.stakeToken?.address?.toLocaleLowerCase()) : null
  return entry
}

const getLpFeesAndApr = (volumeUSD, volumeUSDWeek, liquidityUSD) => {
  const totalFees24h = volumeUSD * TOTAL_FEE
  const totalFees7d = volumeUSDWeek * TOTAL_FEE
  const lpFees24h = volumeUSD * LP_HOLDERS_FEE
  const lpFees7d = volumeUSDWeek * LP_HOLDERS_FEE

  const lpApr7d =
    liquidityUSD > 0 ? (volumeUSDWeek * LP_HOLDERS_FEE * WEEKS_IN_YEAR * 100) / liquidityUSD : 0
  return {
    totalFees24h,
    totalFees7d,
    lpFees24h,
    lpFees7d,
    lpApr7d: lpApr7d !== Infinity ? lpApr7d : 0,
  }
}


const farmApy = (entry) => {
  entry = { ...entry };
  if (!entry.lpTokenInfo || entry.lpTokenInfo.reserveUSD === '0') entry['apy'] = 0

  const { lpApr7d } = getLpFeesAndApr(
    parseFloat(entry.lpTokenInfo.volumeUSD),
    parseFloat(entry.lpTokenInfo.volumeUSD_avg7d),
    parseFloat(entry.lpTokenInfo.reserveUSD),
  )
  
  entry['apy'] = lpApr7d
  return entry
}

const main = async (timestamp = null) => {
  const [block, blockPrior] = await utils.getBlocks('bsc', timestamp, [
    url,
  ]);

  // pull data
  let queryC = query;
  let dataNow = await request(url, queryC.replace('<PLACEHOLDER>', block));
  dataNow = dataNow.farms;

  // get lp tokens
  let lpTokens = await getLpTokens(dataNow)

  // matching lp tokens to farms
  dataNow = dataNow.map((el) => farmDataMapping(el, lpTokens))

  // calculate APY
  const data = dataNow.map((el) => farmApy(el))

  const pools = data.map((p) => {
    const symbol0 = p.stakeToken.isLpToken ?
      utils.formatSymbol(`${p.stakeToken.token0.symbol}/${p.stakeToken.token1.symbol}`) :
      utils.formatSymbol(p.stakeToken.symbol);
    const symbol1 = utils.formatSymbol(p.rewardToken.symbol);
    const symbol = utils.formatSymbol(`${symbol0}-${symbol1}`);
    const underlyingTokens = [p.stakeToken.id, p.rewardToken.id];

    return {
      pool: p.id,
      chain: utils.formatChain('binance'),
      project: 'babydogeswap',
      symbol,
      tvlUsd: Number(p.totalStakedUsdValue),
      rewardTokens: [p.rewardToken.id],
      apyReward: Number(p.APR) * 100,
      apyBase: Number(p.apy) * 100,
      underlyingTokens,
    };
  });

  return pools.filter((p) => utils.keepFinite(p));
};

module.exports = {
  timetravel: false,
  apy: main,
  url: 'https://babydogeswap.com/farms',
};
