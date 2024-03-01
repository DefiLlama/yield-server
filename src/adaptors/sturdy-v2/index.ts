const { BigNumber } = require('bignumber.js');
const { gql, request } = require('graphql-request');
const utils = require('../utils');

const BIG_10 = new BigNumber('10');

const sturdy_v2_subgraph =
  'https://api.thegraph.com/subgraphs/name/sturdyfi/sturdy-v2-ethereum';

const query = gql`
  query SturdyV2Aggregators {
    aggregators(first: 1000) {
      address
      name
      totalAssets
      asset {
        id
        symbol
        decimals
      }
    }
  }
`;

type V2AggregatorSubgraphData = {
  address: `0x${string}`;
  name: string;
  totalAssets: string;
  asset: {
    id: `0x${string}`;
    symbol: string;
    decimals: number;
  };
};

type V2AggregatorAPIData = {
  address: `0x${string}`;
  baseAPY: number;
  rewardsAPY: number;
  rewardTokens: `0x${string}`[];
};

const aggregators = async () => {
  const apiData = (await utils.getData(
    `https://us-central1-stu-dashboard-a0ba2.cloudfunctions.net/v2Aggregators`
  )) as V2AggregatorAPIData[];

  const subgraphData = await request(sturdy_v2_subgraph, query);
  const aggregators = subgraphData.aggregators as V2AggregatorSubgraphData[];

  // fetch token prices
  const assetContracts = aggregators.map((a) => a.asset.id);
  const coins = [...assetContracts].map((addr) => `ethereum:${addr}`);
  const prices = (await utils.getPrices(coins)).pricesByAddress;

  return aggregators.map((a, index) => {
    const { address, name, totalAssets, asset } = a;

    const tvl = new BigNumber(totalAssets)
      .dividedBy(BIG_10.pow(asset.decimals))
      .times(prices[assetContracts[index].toLowerCase()]);

    const apy = apiData.find(
      (e) => e.address.toLowerCase() === address.toLowerCase()
    );
    const apyBase = apy.baseAPY * 100 || 0;
    const apyReward = apy.rewardsAPY * 100 || 0;
    const rewardTokens = apy.rewardTokens || [];

    return {
      pool: address,
      chain: 'ethereum',
      project: 'sturdy-v2',
      symbol: utils.formatSymbol(a.asset.symbol),
      tvlUsd: tvl.toNumber(),
      apyBase,
      apyReward,
      rewardTokens,
      url: `https://v2.sturdy.finance/aggregators/ethereum/${address}`,
      underlyingTokens: [a.asset.id],
      poolMeta: name, // aggregator name
    };
  });
};

module.exports = {
  timetravel: false,
  apy: aggregators,
  url: 'https://v2.sturdy.finance/aggregators/ethereum',
};
