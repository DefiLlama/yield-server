const { request, gql } = require('graphql-request');
const { getUnixTime, subDays, subWeeks, startOfMinute } = require('date-fns');
const { chunk } = require('lodash');

const info_url =
  'https://graph-bsc-mainnet.babydoge.com/subgraphs/name/babydoge/exchange';

const block_url =
  'https://graph-bsc-mainnet.babydoge.com/subgraphs/name/babydoge/blocks';

const getBlockSubqueries = (timestamps) =>
  timestamps.map((timestamp) => {
    return `t${timestamp}:blocks(first: 1, orderBy: timestamp, orderDirection: desc, where: { timestamp_gt: ${timestamp}, timestamp_lt: ${
      timestamp + 600
    } }) {
      number
    }`
  })

const blocksQueryConstructor = (subqueries) => {
  return gql`query blocks {
    ${subqueries}
  }`
}

const multiQuery = async (
  queryConstructor,
  subqueries,
  endpoint,
  skipCount = 100,
) => {
  try {
    const results = await Promise.all(
      chunk(subqueries, skipCount).map((subqueryChunk) =>
        request(endpoint, queryConstructor(subqueryChunk)),
      ),
    )

    return results.reduce((obj, item) => ({ ...obj, ...item }), {})
  } catch (error) {
    console.error('Failed to fetch info data', error)
    return null
  }
}

const getDeltaTimestamps = () => {
  const utcCurrentTime = getUnixTime(new Date()) * 1000
  const t24h = getUnixTime(startOfMinute(subDays(utcCurrentTime, 1)))
  const t48h = getUnixTime(startOfMinute(subDays(utcCurrentTime, 2)))
  const t7d = getUnixTime(startOfMinute(subWeeks(utcCurrentTime, 1)))
  const t14d = getUnixTime(startOfMinute(subWeeks(utcCurrentTime, 2)))
  return [t24h, t48h, t7d, t14d]
}

const getBlocksFromTimestamps = async (
  timestamps,
  sortDirection = 'desc',
  skipCount = 500,
) => {
  if (timestamps?.length === 0) {
    return []
  }

  const fetchedData = await multiQuery(
    blocksQueryConstructor,
    getBlockSubqueries(timestamps),
    block_url,
    skipCount,
  )

  const sortingFunction =
    sortDirection === 'desc'
      ? (a, b) => b.number - a.number
      : (a, b) => a.number - b.number

  const blocks = []
  if (fetchedData) {
    for (const key of Object.keys(fetchedData)) {
      if (fetchedData[key].length > 0) {
        blocks.push({
          timestamp: key.split('t')[1],
          number: parseInt(fetchedData[key][0].number, 10),
        })
      }
    }
    // graphql-request does not guarantee same ordering of batched requests subqueries, hence manual sorting
    blocks.sort(sortingFunction)
  }
  return blocks
}

const getAmountChange = (valueNow, valueBefore) => {
  if (valueNow && valueBefore) {
    return valueNow - valueBefore
  }
  if (valueNow) {
    return valueNow
  }
  return 0
}

const getPercentChange = (valueNow, valueBefore) => {
  if (valueNow && valueBefore) {
    return ((valueNow - valueBefore) / valueBefore) * 100
  }
  return 0
}

const getChangeForPeriod = (
  valueNow,
  valueOnePeriodAgo,
  valueTwoPeriodsAgo,
) => {
  const currentPeriodAmount = getAmountChange(valueNow, valueOnePeriodAgo)
  const previousPeriodAmount = getAmountChange(valueOnePeriodAgo, valueTwoPeriodsAgo)
  const percentageChange = getPercentChange(currentPeriodAmount, previousPeriodAmount)
  return [currentPeriodAmount, percentageChange]
}

const getLpTokens = async (farms) => {
  const [t24h, t48h, t7d, t14d] = getDeltaTimestamps()
  const blocks = await getBlocksFromTimestamps([t24h, t48h, t7d, t14d])

  const pairs = farms
    .filter((farm) => farm.isStakeTokenLpToken)
    .map((farm) => farm.stakeToken?.id);
  if (pairs.length > 0) {
    const lpQuery = gql`
    {
        ${pairs
        .map(
          (pair) => `
            pd${pair}:pair(id: "${pair}") {
              name
              totalSupply
              reserveUSD
              volumeUSD
            }
            d7${pair}:pair(id: "${pair}" block: {number: ${blocks[2]?.number}}) {
              name
              totalSupply
              reserveUSD
              volumeUSD
            }
            
          `,
        )
        .join('')}
    }`
    const data = await request(info_url, lpQuery);
    const keys = Object.keys(data).filter((key) => key.startsWith('pd'));
    const lpTokens = keys.map((key) => {
      const id = key.slice(2);
      const [volumeUSDWeek] = getChangeForPeriod(
        Number(data[key]?.volumeUSD),
        Number(data[`d7${id}`]?.volumeUSD),
      )
      return {
        ...data[key],
        id,
        volumeUSD_avg7d: volumeUSDWeek,
      };
    });
    return lpTokens;
  }
  return [];
};

exports.getLpTokens = getLpTokens;