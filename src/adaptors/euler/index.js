const WebSocket = require('ws');
const { request, gql } = require('graphql-request');
const superagent = require('superagent');
const sdk = require('@defillama/sdk');
const ethers = require('ethers');

const EulerToolsClient = require('./EulerToolsClient');
const utils = require('../utils');
const abiRewardDistribution = require('./abiRewardDistribution');
const abiStakingRewards = require('./abiStakingRewards');
const abiEtoken = require('./abiEtoken');
const abiEulerSimpleLens = require('./abiEulerSimpleLens');

const url = sdk.graph.modifyEndpoint('EQBXhrF4ppZy9cBYnhPdrMCRaVas6seNpqviih5VRGmU');
const EULERSCAN_ENDPOINT = 'wss://escan-mainnet.euler.finance';
const EULER = '0xd9fcd98c322942075a5c3860693e9f4f03aae07b';
const WETH = '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2';
const rewardsDistribution = '0xA9839D52E964d0ed0d6D546c27D2248Fac610c43';
const EulerSimpleLens = '0x5077B7642abF198b4a5b7C4BdCE4f03016C7089C';

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
    assets(first: 1000) {
      id
      symbol
      decimals
      eTokenAddress
    }
  }
`;

const main = async () => {
  // pool data
  const data = (await request(url, query)).assets;

  // unique markets (id === underlying)
  const markets = data.map((pool) => pool.id);

  // via EulerSimpleLens we pull supply/borrow/available & interest rates
  const [TotalSupplyAndDebtsRes, interestRatesRes, underlyingToAssetConfigRes] =
    await Promise.all(
      [
        'getTotalSupplyAndDebts',
        'interestRates',
        'underlyingToAssetConfig',
      ].map((method) =>
        sdk.api.abi.multiCall({
          calls: markets.map((m) => ({
            target: EulerSimpleLens,
            params: [m],
          })),
          abi: abiEulerSimpleLens.find((x) => x.name === method),
          chain: 'ethereum',
        })
      )
    );

  const TotalSupplyAndDebts = TotalSupplyAndDebtsRes.output.map(
    (o) => o.output
  );
  const interestRates = interestRatesRes.output.map((o) => o.output);
  const underlyingToAssetConfig = underlyingToAssetConfigRes.output.map(
    (o) => o.output
  );

  // gauge data (for EUL borrow rewrads)
  const gaugeData = (await getGaugeData()).result[0].value;

  // price data
  const priceKey = markets
    .concat([EULER, WETH])
    .map((m) => `ethereum:${m}`)
    .join(',');
  const prices = (
    await superagent.get(`https://coins.llama.fi/prices/current/${priceKey}`)
  ).body.coins;

  const eulPrice = prices[`ethereum:${EULER}`].price;
  const nbSecYear = 60 * 60 * 24 * 365;
  const avgBlockTime = 12;
  const nbEpochsYear =
    nbSecYear /
    avgBlockTime /
    (gaugeData.epoch.endBlock - gaugeData.epoch.startBlock);

  const pools = markets
    .map((m, i) => {
      const decimals = 10 ** data[i]?.decimals;
      const underlyingPrice = prices[`ethereum:${m}`]?.price;
      const totalSupplyUsd =
        (TotalSupplyAndDebts[i]?.totalBalances / decimals) * underlyingPrice;
      const totalBorrowUsd =
        (TotalSupplyAndDebts[i]?.totalBorrows / decimals) * underlyingPrice;

      const tvlUsd = totalSupplyUsd - totalBorrowUsd;

      const interestRateDecimals = 1e25;
      const apyBase = interestRates[i]?.supplyAPY / interestRateDecimals;
      const apyBaseBorrow = interestRates[i]?.borrowAPY / interestRateDecimals;

      const borrowFactor = underlyingToAssetConfig[i]?.borrowFactor / 4e9;
      const ltv =
        (underlyingToAssetConfig[i]?.collateralFactor / 4e9) * borrowFactor;

      const eulDist = gaugeData.tokens[m] / 1e18;
      const apyRewardBorrow =
        ((nbEpochsYear * eulDist * eulPrice) / totalBorrowUsd) * 100;

      return {
        pool: `${m}-euler`,
        chain: 'Ethereum',
        project: 'euler',
        symbol: utils.formatSymbol(data[i].symbol),
        tvlUsd,
        apyBase,
        apyBaseBorrow,
        apyRewardBorrow: Number.isFinite(apyRewardBorrow)
          ? apyRewardBorrow
          : null,
        totalSupplyUsd,
        totalBorrowUsd,
        underlyingTokens: [m],
        rewardTokens: [EULER],
        ltv: Number.isFinite(ltv) ? ltv : null,
        url: `https://app.euler.finance/market/${m}`,
        borrowFactor,
      };
    })
    .filter((p) => utils.keepFinite(p));

  // sUSD pool
  const lendingPools = pools.filter(
    (p) => p.pool !== '0x57ab1ec28d129707052df4df418d58a2d46d5f51-euler'
  );

  // add new staking pools
  const distributionsLength = (
    await sdk.api.abi.call({
      target: rewardsDistribution,
      abi: abiRewardDistribution.find((m) => m.name === 'distributionsLength'),
      chain: 'ethereum',
    })
  ).output;

  // staking pools
  const distributions = (
    await sdk.api.abi.multiCall({
      calls: Array.from(Array(Number(distributionsLength)).keys()).map((i) => ({
        target: rewardsDistribution,
        params: [i],
      })),
      abi: abiRewardDistribution.find((m) => m.name === 'distributions'),
      chain: 'ethereum',
    })
  ).output.map((o) => o.output);

  const totalSupply = (
    await sdk.api.abi.multiCall({
      calls: distributions.map((i) => ({
        target: i.destination,
      })),
      abi: abiStakingRewards.find((m) => m.name === 'totalSupply'),
      chain: 'ethereum',
    })
  ).output.map((o) => o.output);

  const rewardRate = (
    await sdk.api.abi.multiCall({
      calls: distributions.map((i) => ({
        target: i.destination,
      })),
      abi: abiStakingRewards.find((m) => m.name === 'rewardRate'),
      chain: 'ethereum',
    })
  ).output.map((o) => o.output);

  const stakingToken = (
    await sdk.api.abi.multiCall({
      calls: distributions.map((i) => ({
        target: i.destination,
      })),
      abi: abiStakingRewards.find((m) => m.name === 'stakingToken'),
      chain: 'ethereum',
    })
  ).output.map((o) => o.output);

  const stakingPools = await Promise.all(
    stakingToken.map(async (p, i) => {
      const ePool = data.find(
        (pool) => pool.eTokenAddress.toLowerCase() === p.toLowerCase()
      );

      const priceKey = `ethereum:${ePool.id}`;
      const underlyingPrice = (
        await superagent.get(
          `https://coins.llama.fi/prices/current/${priceKey}`
        )
      ).body.coins[priceKey].price;

      // contracts return eToken balances, which need to be converted to underlying balance
      // at current exchange rate
      const underlyingBalance =
        (
          await sdk.api.abi.call({
            target: stakingToken[i],
            params: [
              ethers.utils.parseEther((totalSupply[i] / 1e18).toString()),
            ],
            abi: abiEtoken.find((m) => m.name === 'convertBalanceToUnderlying'),
            chain: 'ethereum',
          })
        ).output /
        10 ** ePool.decimals;

      const tvlUsd = underlyingBalance * underlyingPrice;

      const eulerPerDay = (rewardRate[i] / 1e18) * 3600 * 24;
      const apyReward = ((eulerPerDay * 365 * eulPrice) / tvlUsd) * 100;

      const apyBase = lendingPools.find((lp) =>
        lp.pool.toLowerCase().includes(ePool.id.toLowerCase())
      )?.apyBase;

      return {
        pool: distributions[i].destination,
        chain: 'Ethereum',
        project: 'euler',
        symbol: `e${ePool.symbol}`,
        tvlUsd,
        apyBase,
        apyReward,
        underlyingTokens: [ePool.id],
        rewardTokens: [EULER],
        url: 'https://app.euler.finance/staking',
        poolMeta: 'Staking',
      };
    })
  );

  return lendingPools.concat(stakingPools);
};

module.exports = {
  timetravel: false,
  apy: main,
};
