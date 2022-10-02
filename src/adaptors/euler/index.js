const WebSocket = require('ws');
const { request, gql } = require('graphql-request');
const superagent = require('superagent');

const EulerToolsClient = require('./EulerToolsClient');
const utils = require('../utils');

const url = 'https://api.thegraph.com/subgraphs/name/euler-xyz/euler-mainnet';
const EULERSCAN_ENDPOINT = 'wss://escan-mainnet.euler.finance';

// see: https://gist.github.com/kasperpawlowski/1fb2c0a70a57f845cc7b462aa3ebdca6
const eulerClient = new EulerToolsClient({
  version: 'example script',
  endpoint: EULERSCAN_ENDPOINT,
  WebSocket,
  onConnect: () => console.log('Euler History Client connected'),
  onDisconnect: () => console.log('Euler History Client disconnected'),
});

const getGaugeData = () => {
  return new Promise((resolve, reject) => {
    eulerClient.connect();

    const id = eulerClient.sub(
      { cmd: 'sub', query: { topic: 'rewardsIssuance' } },
      (err, data) => {
        if (err) return reject(err);
        eulerClient.unsubscribe(id);
        resolve(data);
      }
    );
  });
};

const query = gql`
  {
    assets {
      id
      symbol
      supplyAPY
      borrowAPY
      totalBalancesUsd
      totalBorrowsUsd
      config {
        collateralFactor
      }
      decimals
    }
  }
`;

const main = async () => {
  // pool data
  const data = await request(url, query);
  // gauge data (for EUL borrow rewrads)
  const gaugeData = (await getGaugeData()).result[0].value;
  const priceKey = 'ethereum:0xd9fcd98c322942075a5c3860693e9f4f03aae07b';
  const eulPrice = (
    await superagent.get(`https://coins.llama.fi/prices/current/${priceKey}`)
  ).body.coins[priceKey].price;
  const nbSecYear = 60 * 60 * 24 * 365;
  const avgBlockTime = 12;
  const nbEpochsYear =
    nbSecYear /
    avgBlockTime /
    (gaugeData.epoch.endBlock - gaugeData.epoch.startBlock);

  const pools = data.assets.map((pool) => {
    const ltv = pool.config?.collateralFactor / 4e9;
    const totalSupplyUsd = pool.totalBalancesUsd / `1e${pool.decimals}`;
    const totalBorrowUsd = pool.totalBorrowsUsd / `1e${pool.decimals}`;

    const eulDist = gaugeData.tokens[pool.id] / 1e18;
    const apyRewardBorrow =
      ((nbEpochsYear * eulDist * eulPrice) / totalBorrowUsd) * 100;

    return {
      pool: `${pool.id}-euler`,
      chain: 'Ethereum',
      project: 'euler',
      symbol: utils.formatSymbol(pool.symbol),
      tvlUsd: totalSupplyUsd - totalBorrowUsd,
      apyBase: pool.supplyAPY / 1e25,
      apyBaseBorrow: pool.borrowAPY / 1e25,
      apyRewardBorrow: Number.isFinite(apyRewardBorrow)
        ? apyRewardBorrow
        : null,
      totalSupplyUsd,
      totalBorrowUsd,
      underlyingTokens: [pool.id],
      rewardTokens: ['0xd9fcd98c322942075a5c3860693e9f4f03aae07b'],
      ltv: Number.isFinite(ltv) ? ltv : null,
      url: `https://app.euler.finance/market/${pool.id}`,
    };
  });

  return pools;
};

module.exports = {
  timetravel: false,
  apy: main,
};
