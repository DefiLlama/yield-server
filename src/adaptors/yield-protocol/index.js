const sdk = require('@defillama/sdk');
const { request, gql } = require('graphql-request');
const { formatChain, formatSymbol } = require('../utils');
const superagent = require('superagent');
const { format } = require('date-fns');
const { compact } = require('lodash');

const SUBGRAPHS = {
  ethereum: sdk.graph.modifyEndpoint(
    '7wjb6tjwaKtZagvNJ8eK18bHkEigLDePhvcryNbGbJEL'
  ),
  arbitrum: sdk.graph.modifyEndpoint(
    '4pW9NfmTa6AwHV9KG3JU6RynQMaNR9dzchxBYF3vy4Q9'
  ),
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

  const EULER_SUPGRAPH_ENDPOINT = sdk.graph.modifyEndpoint(
    'EQBXhrF4ppZy9cBYnhPdrMCRaVas6seNpqviih5VRGmU'
  );

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
  // double check is not matured
  const NOW = Math.floor(Date.now() / 1000);
  const filteredSeriesEntities = seriesEntities.filter((s) => NOW < s.maturity);

  const pools = await Promise.all(
    filteredSeriesEntities.map(async (seriesEntity) => {
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
      const poolAPY = sharesTokenAPY + +fyTokenInterestAPR + +feeAPR;
      const poolRewardsAPY = 0;

      // split the yield protocol pool into a liquidity providing object, and a lending/borrowing object for ease of data representation
      return [
        {
          pool: `${poolAddr}-lp-${chain}`.toLowerCase(),
          chain: formatChain(chain),
          project: 'yield-protocol',
          symbol: baseSymbol,
          underlyingTokens: [baseAddr, fyTokenAddr],
          apyReward: poolRewardsAPY, // TODO: pool/strategy reward apy estimate
          apyBase: poolAPY, // variable apy estimate for providing liquidity
          tvlUsd,
          url: `https://app.yieldprotocol.com/`,
          poolMeta: `variable rate ${formatMaturity(maturity)}`,
        },
        {
          pool: `${poolAddr}-lendborrow-${chain}`.toLowerCase(),
          chain: formatChain(chain),
          project: 'yield-protocol',
          symbol: baseSymbol,
          underlyingTokens: [baseAddr, fyTokenAddr],
          apyBase: +lendAPR, // fixed rate lend apr estimate when using one unit to the decimals of base
          apyBaseBorrow: +borrowAPR, // fixed rate borrow apr estimate when using one unit to the decimals of base
          tvlUsd,
          totalSupplyUsd,
          totalBorrowUsd,
          url: `https://app.yieldprotocol.com/`,
          poolMeta: `fixed rate ${formatMaturity(maturity)}`,
          ltv: 0.7, // using 70% ltv, which is close to an eth/stable borrow, but the ltv differs between each collateral/base pair (there are many collateral assets available for each base)
        },
      ];
    })
  );

  return compact(pools).flat();
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
