const { request, gql } = require('graphql-request');
const { formatChain, formatSymbol } = require('../utils');
const superagent = require('superagent');
const { format } = require('date-fns');
const { compact } = require('lodash');

const SUBGRAPH_BASE = 'https://api.thegraph.com/subgraphs/name/yieldprotocol/';

const SUBGRAPHS = {
  ethereum: `${SUBGRAPH_BASE}v2-mainnet`,
  arbitrum: `${SUBGRAPH_BASE}v2-arbitrum`,
};

const formatMaturity = (maturity) => {
  return format(new Date(maturity * 1000), 'dd MMM yyyy');
};

// get the total base borrowed for a specific seriesEntity
const getTotalBorrow = async (seriesEntityId, chain) => {
  const url = SUBGRAPHS[chain];
  const query = gql`
    {
      vaults(where: { series: "${seriesEntityId}", debtAmount_gt: "0" }) {
        debtAmount
      }
    }
  `;

  const { vaults: subgraphVaults } = await request(url, query);

  const totalBorrow = subgraphVaults.reduce((acc, vault) => {
    return acc + +vault.debtAmount;
  }, 0);

  return totalBorrow;
};

const getPools = async (chain) => {
  const url = SUBGRAPHS[chain];
  const query = gql`
    {
      seriesEntities(where: { matured: false }) {
        id
        fyToken {
          id
          pools {
            apr
            id
            currentFYTokenPriceInBase
            tvlInBase
          }
          totalSupply
          symbol
        }
        maturity
        baseAsset {
          id
          symbol
        }
      }
    }
  `;
  const { seriesEntities } = await request(url, query);

  const pools = await Promise.all(
    seriesEntities.map(async (seriesEntity) => {
      const {
        id: seriesEntityId,
        fyToken: {
          id: fyTokenAddr,
          pools,
          totalSupply: fyTokenTotalSupply,
          symbol: fyTokenSymbol,
        },
        maturity,
        baseAsset: { id: baseAddr, symbol: baseSymbol },
      } = seriesEntity;

      const pool = pools[0]; // grab the first pool since there should be only one pool per seriesEntity
      const {
        id: poolAddr,
        currentFYTokenPriceInBase,
        tvlInBase,
        // borrowApy, lendApy, poolApy,
      } = pool;

      // price of base token in USD terms
      const key = `${chain}:${baseAddr}`;
      const priceRes = await superagent.get(
        `https://coins.llama.fi/prices/current/${key}`
      );
      const price = priceRes.body.coins[key];
      const priceBaseUsd = price ? price.price : 0;

      // total base value in pool plus total fyToken value (in base) in pool, converted to USD
      const tvlUsd = tvlInBase * priceBaseUsd;
      // total fyTokens in circulation converted to base, then to USD
      const totalSupplyUsd =
        currentFYTokenPriceInBase * fyTokenTotalSupply * priceBaseUsd;
      // total borrowed in USD for this specific pool/series
      const totalBorrowUsd =
        (await getTotalBorrow(seriesEntityId, chain)) * priceBaseUsd;

      // apy estimate when providing liquidity
      const apy = 0; // TODO: calculate/estimate lp token return
      // apy estimate when lending (buying fyToken)
      const apyBase = 0; // TODO: calculate/estimate apy lend
      // apy estimate when borrowing from the pool
      const apyBaseBorrow = 0; // TODO: calculate/estimate apy borrow

      // extra data
      const maturityFormatted = formatMaturity(maturity);
      const name = `${poolAddr}-${chain}`.toLowerCase();
      const poolMeta = `Yield Protocol ${formatSymbol(
        baseSymbol
      )} ${maturityFormatted}`.trim();

      return {
        pool: name,
        chain: formatChain(chain),
        project: 'yield-protocol',
        symbol: formatSymbol(`${fyTokenSymbol}LP`),
        underlyingTokens: [baseAddr, fyTokenAddr],
        apy, // liquidity providing apy estimate
        apyReward: 0, // pool reward apy estimate
        apyBase, // lend apy estimate
        apyBaseBorrow, // borow apy estimate
        tvlUsd,
        totalSupplyUsd,
        totalBorrowUsd,
        url: `https://app.yieldprotocol.com/`,
        poolMeta,
      };
    })
  );

  return compact(pools);
};

const main = async () => {
  return Object.keys(SUBGRAPHS).reduce(async (acc, chain) => {
    return [...(await acc), ...(await getPools(chain))];
  }, Promise.resolve([]));
};

module.exports = {
  timetravel: false,
  apy: main,
  url: 'https://app.yieldprotocol.com/',
};
