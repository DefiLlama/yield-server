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

// in certain pools, the underlying is deposited to earn interest; therefore, as a liquidity provider, a portion of the provided liquidity earns interest
// currently only mainnet pools are depositing base (underlying) into euler markets to accumulate interest
const getBlendedSharesTokenAPY = async (
  sharesTokenAddr,
  chain,
  poolBaseValue,
  sharesReserves,
  currentSharePrice
) => {
  if (chain !== 'ethereum') return 0;

  const EULER_SUPGRAPH_ENDPOINT =
    'https://api.thegraph.com/subgraphs/name/euler-xyz/euler-mainnet';

  const query = `
  query ($address: Bytes!) {
    eulerMarketStore(id: "euler-market-store") {
      markets(where:{eTokenAddress:$address}) {
        supplyAPY
       } 
    }
  }
`;

  try {
    const {
      eulerMarketStore: { markets },
    } = await request(EULER_SUPGRAPH_ENDPOINT, query, {
      address: sharesTokenAddr,
    });
    const sharesAPY = (+markets[0].supplyAPY * 100) / 1e27;

    // convert shares to base
    const sharesValRatio = (sharesReserves * currentSharePrice) / poolBaseValue;
    return sharesAPY * sharesValRatio;
  } catch (e) {
    return 0;
  }
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
            borrowAPR
            lendAPR
            feeAPR
            fyTokenInterestAPR
            id
            currentFYTokenPriceInBase
            tvlInBase
            sharesToken
            baseReserves
            currentSharePrice
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
        borrowAPR,
        lendAPR,
        fyTokenInterestAPR,
        feeAPR,
        sharesToken,
        baseReserves,
        currentSharePrice,
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
      // pool apy = sharesTokenAPY + fyTokenInterestAPR + feeAPR
      // only calc if the pool uses shares token
      const sharesTokenAPY =
        baseAddr === sharesToken
          ? 0
          : await getBlendedSharesTokenAPY(
              sharesToken,
              chain,
              tvlInBase,
              baseReserves, // when pool is tv, this is actually shares
              currentSharePrice
            );
      const apy = sharesTokenAPY + +fyTokenInterestAPR + +feeAPR;

      // extra data
      const maturityFormatted = formatMaturity(maturity);
      const name = `${poolAddr}-${chain}`.toLowerCase();

      return {
        pool: name,
        chain: formatChain(chain),
        project: 'yield-protocol',
        symbol: formatSymbol(`${fyTokenSymbol}LP`),
        underlyingTokens: [baseAddr, fyTokenAddr],
        apy, // liquidity providing apy estimate
        apyReward: 0, // TODO: pool/strategy reward apy estimate
        apyBase: lendAPR, // lend apr estimate when using one unit to the decimals of base
        apyBaseBorrow: borrowAPR, // borrow apr estimate when using one unit to the decimals of base
        tvlUsd,
        totalSupplyUsd,
        totalBorrowUsd,
        url: `https://app.yieldprotocol.com/`,
        poolMeta: maturityFormatted,
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
