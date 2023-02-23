const { request, gql } = require('graphql-request');
const { formatChain, formatSymbol } = require('../utils');
const superagent = require('superagent');
const { format } = require('date-fns');
const { compact } = require('lodash');

// TODO
// add symbol, totalBorrowed on pool in subgraph

const SUBGRAPH_BASE = 'https://api.thegraph.com/subgraphs/name/yieldprotocol/';

const SUBGRAPHS = {
  ethereum: `${SUBGRAPH_BASE}v2-mainnet`,
  arbitrum: `${SUBGRAPH_BASE}v2-arbitrum`,
};

const formatMaturity = (maturity) => {
  return format(new Date(maturity * 1000), 'dd MMM yyyy');
};

const getPools = async (chain) => {
  const url = SUBGRAPHS[chain];
  const query = gql`
    {
      pools {
        id
        base
        fyToken {
          id
          totalSupply
          maturity
          symbol
        }
        currentFYTokenPriceInBase
        tvlInBase
      }
      _meta {
        block {
          timestamp
        }
      }
    }
  `;

  const {
    pools: subgraphPools,
    _meta: {
      block: { timestamp },
    },
  } = await request(url, query);

  const pools = await Promise.all(
    subgraphPools.map(async (pool) => {
      const {
        id: poolAddress,
        base: baseAddr,
        fyToken: {
          id: fyTokenAddr,
          totalSupply: fyTokenTotalSupply,
          maturity,
          symbol,
        },
        tvlInBase,
        currentFYTokenPriceInBase,
        // apy,
        // borrowAPY,
        // lendAPY,
      } = pool;

      // don't grab matured pool data
      if (maturity < timestamp) return;

      // price of base token in USD terms
      const key = `${chain}:${baseAddr}`;
      const priceRes = await superagent.get(
        `https://coins.llama.fi/prices/current/${key}`
      );
      const price = priceRes.body.coins[key];
      const priceBaseUsd = price ? price.price : 0;

      // total borrow/lend calculations
      const tvlUsd = tvlInBase * priceBaseUsd;
      const totalSupplyUsd =
        currentFYTokenPriceInBase * fyTokenTotalSupply * priceBaseUsd; // total fyTokens in circulation converted to base, then to USD;
      const totalBorrowUsd = tvlUsd - totalSupplyUsd; // TODO check if true

      // apy calculations
      const apyBase = 0; // TODO: calculate/estimate lp token return
      const apyBaseBorrow = 0; // TODO: calculate/estimate apr borrow
      const apyBaseSupply = 0; // TODO: calculate/estimate apr borrow

      // extra data
      const maturityFormatted = formatMaturity(maturity);
      const name = `${poolAddress}-${chain}`.toLowerCase();
      const poolMeta =
        `Yield Protocol ${price.symbol} ${maturityFormatted}`.trim();

      return {
        pool: name,
        chain: formatChain(chain),
        project: 'yield-protocol',
        symbol: formatSymbol(`${symbol}LP`),
        tvlUsd,
        apy: 0, // pool apy estimate
        apyReward: 0, // pool reward apy estimate
        apyBase, // lend apy estimate
        underlyingTokens: [baseAddr, fyTokenAddr],
        apyBaseBorrow, // borow apy estimate
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
