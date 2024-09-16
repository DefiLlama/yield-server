const sdk = require('@defillama/sdk');
const { BigNumber } = require('bignumber.js');
const { DataProviderAbi } = require('./abi');
const utils = require('../utils');

const BIG_10 = new BigNumber('10');

// DataProvider Addresses
const config = {
  ethereum: '0x69764E3e0671747A7768A1C1AfB7C0C39868CC9e',
  mode: '0xF0382A9Eca5276d7B4BbcC503e4159C046c120ec',
};

const aggregators = async () => {
  const apiData = await utils.getData(
    `https://us-central1-stu-dashboard-a0ba2.cloudfunctions.net/v2Aggregators`
  );

  // const subgraphData = await request(sturdy_v2_subgraph, query);
  // const aggregators = subgraphData.aggregators as V2AggregatorSubgraphData[];

  const aggregators = (await Promise.all(
    Object.keys(config)
      .map(async (chain) => {
        const chainAggregators = (
          await sdk.api.abi.call({
            target: config[chain],
            abi: DataProviderAbi.find((m) => m.name === 'getVaults'),
            chain,
          })
        ).output;

        return chainAggregators.map((e) => {
          return {
            ...e,
            chainName: chain,
          };
        });
      })
  )).flat();

  // fetch token prices
  const assetContracts = aggregators.map((a) => a.asset);
  const coins = aggregators.map((a) => `${a.chainName}:${a.asset}`);
  const prices = (await utils.getPrices(coins)).pricesByAddress;

  return aggregators.map((a, index) => {
    const { chainName, deployedAt: address, name, totalAssets, asset, assetDecimals, assetSymbol } = a;

    const tvl = new BigNumber(totalAssets)
      .dividedBy(BIG_10.pow(assetDecimals))
      .times(prices[assetContracts[index].toLowerCase()]);

    const apy = apiData.find(
      (e) => e.address.toLowerCase() === address.toLowerCase()
    );
    const apyBase = apy?.baseAPY * 100 || 0;
    const apyReward = apy?.rewardsAPY * 100 || 0;
    const rewardTokens = apy?.rewardTokens || [];

    return {
      pool: address,
      chain: chainName,
      project: 'sturdy-v2',
      symbol: utils.formatSymbol(assetSymbol),
      tvlUsd: tvl.toNumber(),
      apyBase,
      apyReward,
      rewardTokens,
      url: `https://v2.sturdy.finance/aggregators/${chainName}/${address}`,
      underlyingTokens: [asset],
      poolMeta: name, // aggregator name
    };
  }).filter((a) => a.tvlUsd > 0).map(i => ({...i, pool: i.pool.toLowerCase()}));
};

module.exports = {
  timetravel: false,
  apy: aggregators,
  url: 'https://v2.sturdy.finance/aggregators',
};
