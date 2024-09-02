const { request, gql } = require('graphql-request');
const sdk = require('@defillama/sdk');
const superagent = require('superagent');
const { default: BigNumber } = require('bignumber.js');
const {
  utils: { formatEther },
} = require('ethers');
const abi = require('./abi');

const GRAPH_URL = sdk.graph.modifyEndpoint('42Yjxm8KTaBKfnzycNEhizZxd8jDfgnH9F5kWkzBikAq');

const chain = 'polygon';

const ONE_HOUR = 3600;
const ONE_DAY = ONE_HOUR * 24;
const ONE_WEEK = ONE_DAY * 7;
const ONE_YEAR = ONE_HOUR * 8760;

const ROCI_SETTINGS_PROVIDER = '0xb2e577a112A6F2C6d3d511ade2AD512cEA312a6d';
const ROCI_LIMIT_MANAGER = '0x347892c2c0C230f0803127F4E1137b3e975F57E4';

const getDtPricesQuery = (pool) => gql`
  query RociFiDtPrices {
    dtPriceUpdates(
      orderBy: "timestamp"
      orderDirection: "desc"
      first: 10
      where: {
        market: "${pool.toLowerCase()}",
        timestamp_gte: ${Math.floor(Date.now() / 1000) - ONE_WEEK}
      }
    ) {
      dtPrice
      timestamp
    }
  }
`;

const getApy = async (pool) => {
  const graphData = await request(GRAPH_URL, getDtPricesQuery(pool));
  if (
    !graphData?.dtPriceUpdates?.length ||
    graphData.dtPriceUpdates.length === 1
  )
    return 0;

  const { dtPriceUpdates } = graphData;

  const priceUpdateA = dtPriceUpdates[0];

  const priceUpdateB =
    dtPriceUpdates.find(
      (p) => priceUpdateA.timestamp - p.timestamp >= ONE_DAY
    ) || dtPriceUpdates[dtPriceUpdates.length - 1];

  const timestampDiff =
    Number(priceUpdateA.timestamp) - Number(priceUpdateB.timestamp);

  const apy = BigNumber(priceUpdateA.dtPrice)
    .minus(priceUpdateB.dtPrice)
    .dividedBy(priceUpdateB.dtPrice)
    .multipliedBy(ONE_YEAR)
    .dividedBy(timestampDiff)
    .multipliedBy(100)
    .toNumber();

  return apy;
};

const getPricesByAddresses = async (addresses) => {
  const prices = (
    await superagent.get(
      `https://coins.llama.fi/prices/current/${addresses
        .map((address) => `${chain}:${address}`)
        .join(',')
        .toLowerCase()}`
    )
  ).body.coins;

  return Object.entries(prices).reduce(
    (acc, [name, price]) => ({
      ...acc,
      [name.split(':')[1]]: price.price,
    }),
    {}
  );
};

async function getPools() {
  const pools = (
    await sdk.api.abi.call({
      target: ROCI_SETTINGS_PROVIDER,
      abi: abi.settingsProvider.getPools,
      chain,
    })
  ).output;

  return Promise.all(
    await pools.map(async (pool) => {
      const [symbol, underlyingToken] = await Promise.all(
        ['symbol', 'underlyingToken'].map(async (method) => {
          const response = await sdk.api.abi.call({
            target: pool,
            chain,
            abi: abi.pool[method],
          });

          return response.output;
        })
      );

      const [underlyingDecimals, underlyingSymbol, poolTvl] = await Promise.all(
        ['decimals', 'symbol', 'balanceOf'].map(async (method) => {
          const response = await sdk.api.abi.call({
            target: underlyingToken,
            abi: `erc20:${method}`,
            chain,
            params: method === 'balanceOf' ? [pool] : undefined,
          });
          return response.output;
        })
      );

      const totalBorrowed = (
        await sdk.api.abi.call({
          target: ROCI_LIMIT_MANAGER,
          chain,
          abi: abi.limitManager.poolToBorrowedAmount,
          params: [pool],
        })
      ).output;

      const scoreTenLTVs = (
        await sdk.api.abi.call({
          target: ROCI_SETTINGS_PROVIDER,
          chain,
          abi: abi.settingsProvider.getPoolToScoreLtvs,
          params: [pool, 10],
        })
      ).output;

      const ltv =
        parseFloat(formatEther(scoreTenLTVs[scoreTenLTVs.length - 1])) / 100;

      const scoreTenBorrowSettings = (
        await sdk.api.abi.call({
          target: ROCI_SETTINGS_PROVIDER,
          chain,
          abi: abi.settingsProvider.getInterestSettings,
          params: [pool, 10, scoreTenLTVs[0], 7 * ONE_DAY],
        })
      ).output;

      const apyBaseBorrow = parseFloat(
        formatEther(scoreTenBorrowSettings.interest)
      );

      return {
        address: pool,
        symbol,
        underlyingToken: underlyingToken?.toLowerCase(),
        underlyingDecimals,
        underlyingSymbol,
        tvl: poolTvl,
        totalBorrowed,
        apyBaseBorrow,
        ltv,
      };
    })
  );
}

async function getPoolData() {
  const pools = await getPools();
  const prices = await getPricesByAddresses(
    pools.map((pool) => pool.underlyingToken)
  );

  return Promise.all(
    pools.map(async (pool, index) => {
      const price = prices[pool.underlyingToken];

      const decimals = Number(pool.underlyingDecimals);

      const totalSupply = BigNumber(pool.tvl).plus(pool.totalBorrowed);

      const [tvlUsd, totalSupplyUsd, totalBorrowUsd] = [
        pool.tvl,
        totalSupply,
        pool.totalBorrowed,
      ].map((value) =>
        BigNumber(value).shiftedBy(-decimals).multipliedBy(price).toNumber()
      );

      const apyBase = await getApy(pool.address);

      return {
        pool: `${pool.address}-${chain}`,
        chain,
        project: 'rocifi-v2',
        symbol: pool.symbol,
        tvlUsd,
        apyBase,
        underlyingTokens: [pool.underlyingToken],
        poolMeta: `RociFi ${pool.underlyingSymbol} lending pool`,
        totalBorrowUsd,
        totalSupplyUsd,
        apyBaseBorrow: pool.apyBaseBorrow,
        ltv: pool.ltv,
      };
    })
  );
}

module.exports = {
  timetravel: false,
  apy: getPoolData,
  url: 'https://roci.fi/app/markets',
};
