const { request, gql } = require('graphql-request');
const utils = require('../utils');
const sdk = require('@defillama/sdk');
const superagent = require('superagent');
const { default: BigNumber } = require('bignumber.js');
const { Web3 } = require('web3');
const { chains, gaugesUrl } = require('./config');
const StakingABI = require('./abis/abiStakingRewardsMulti.json');

const SECONDS_IN_YEAR = 3153600;
const UNBOOSTED_REWARD_RATIO = 0.4;

//set up queries
const getBlockNumberQuery = gql`
  query BlockNumSubgraph {
    _meta {
      block {
        number
      }
    }
  }
`;

const getGaugesQuery = gql`
  query DfxGauges_GetDfxGauges($blockNum: Int) {
    gauges(where: { active: true }, block: { number: $blockNum }) {
      id
      decimals
      symbol
      lpt
      lptAmount
      workingSupply
      totalSupply
      dfxBalance
      rewardCount
      rewardsAvailable {
        amount
        token {
          id
          name
          symbol
          decimals
        }
      }
      weight
      proportionalWeight
      startProportionalWeight
      weightDelta
      active
      blockNum
    }
  }
`;

const getTokenPairsQuery = gql`
  query DfxCurvesStats_GetDfxPairs($blockNum: Int) {
    pairs(block: { number: $blockNum }) {
      id
      reserve0
      reserve1
      volumeUSD
      token0 {
        symbol
        id
        name
      }
      token1 {
        symbol
        id
        name
      }
    }
  }
`;

//set up web3 providers
const web3_Poly = new Web3(process.env.ALCHEMY_CONNECTION_POLYGON);
const web3_Arb = new Web3(process.env.ALCHEMY_CONNECTION_ARBITRUM);

//functional code starts here
const buildPool = (entry, chainString) => {
  const symbol = utils.formatSymbol(
    `${entry.token0.symbol}-${entry.token1.symbol}`
  );

  const newPool = {
    pool: entry.id,
    chain: utils.formatChain(chainString),
    project: 'dfx-v2',
    symbol,
    tvlUsd: entry.totalValueLockedUSD,
    rewardTokens: entry.rewardsTokens,
    apyReward: entry.apyReward,
    apyBase: entry.apy1d,
    apyBase7d: entry.apy7d,
    underlyingTokens: [entry.token0.id, entry.token1.id],
    volumeUsd1d: entry.volumeUSD1d,
    volumeUsd7d: entry.volumeUSD7d,
  };

  return newPool;
};

const calculateRewardsFromContracts = async (
  chainString,
  entry,
  stakingAddress
) => {
  const web3 = chainString === 'polygon' ? web3_Poly : web3_Arb;
  const stakingContract = new web3.eth.Contract(StakingABI, stakingAddress);

  const rewardsDuration = await stakingContract.methods
    .rewardsDuration()
    .call();

  const rewardForDuration = await stakingContract.methods
    .getRewardForDuration()
    .call();

  const rewardsAvailable = [];

  for (let i = 0; i < rewardForDuration.length; i++) {
    const rewardToken = await stakingContract.methods.rewardsTokens(i).call();

    rewardsAvailable.push({
      token: rewardToken,
      amount: rewardForDuration[i],
    });
  }

  entry.rewardsTokens = rewardsAvailable.map((reward) =>
    reward.token.toLowerCase()
  );

  const { pricesByAddress } = await utils.getPrices(
    entry.rewardsTokens,
    chainString
  );

  const rewardsAmountUSDForDuration = rewardsAvailable.reduce((acc, reward) => {
    return (
      acc +
      (pricesByAddress[reward.token.toLowerCase()] * Number(reward.amount)) /
        1e18
    );
  }, 0);

  //reward amounts are based on duration which is in seconds so we divide by seconds in a year
  entry.apyReward =
    (rewardsAmountUSDForDuration / entry.totalValueLockedUSD) *
    (SECONDS_IN_YEAR / Number(rewardsDuration)) *
    100;

  return entry;
};

const calculateRewardsFromGauges = async (
  chainString,
  entry,
  gauges,
  stakingAddress
) => {
  const gauge = gauges.find(
    (gauge) => gauge.id == stakingAddress.toLowerCase()
  );

  entry.rewardsTokens = gauge.rewardsAvailable.map((reward) =>
    reward.token.id.toLowerCase()
  );

  const { pricesByAddress } = await utils.getPrices(
    entry.rewardsTokens,
    chainString
  );

  const gaugeProporationalWeight =
    (UNBOOSTED_REWARD_RATIO * gauge.totalSupply) / gauge.workingSupply;

  const rewardsAmountUSDForWeek = gauge.rewardsAvailable.reduce(
    (acc, reward) => {
      return (
        acc +
        pricesByAddress[reward.token.id.toLowerCase()] *
          (reward.amount * gaugeProporationalWeight)
      );
    },
    0
  );

  //rewards amounts are per week, so we multiply by 52
  entry.apyReward =
    (rewardsAmountUSDForWeek / entry.totalValueLockedUSD) * 52 * 100;

  return entry;
};

const calculateRewardsApy = async (chainString, entry, gauges, chain) => {
  entry.rewardsTokens = [];
  entry.apyReward = 0;

  const pool = chain.stakingPools.find(
    (f) => f.curveAddress.toLowerCase() === entry.id.toLowerCase()
  );

  if (!pool) {
    return entry;
  }
  const stakingAddress = pool.stakingAddress;

  if (chainString != 'ethereum') {
    entry = await calculateRewardsFromContracts(
      chainString,
      entry,
      stakingAddress
    );
  } else {
    entry = await calculateRewardsFromGauges(
      chainString,
      entry,
      gauges,
      stakingAddress
    );
  }

  return entry;
};

const processPoolsOnChain = async (chainString, chain, timestamp, version) => {
  const url = chain.url;

  //determine starting blocks
  const [block, blockPrior] = await utils.getBlocks(chainString, timestamp, [
    url,
  ]);

  const [_, blockPrior7d] = await utils.getBlocks(
    chainString,
    timestamp,
    [url],
    604800
  );

  // pull data
  let data = (
    await request(url, getTokenPairsQuery, {
      blockNum: block,
    })
  ).pairs;

  // pull 24h offset data to calculate fees from swap volume
  const dataPrior = (
    await request(url, getTokenPairsQuery, {
      blockNum: blockPrior,
    })
  ).pairs;

  // 7d offset
  const dataPrior7d = (
    await request(url, getTokenPairsQuery, {
      blockNum: blockPrior7d,
    })
  ).pairs;

  let gauges = [];

  if (chainString === 'ethereum') {
    gauges = (
      await request(gaugesUrl, getGaugesQuery, {
        blockNum: block,
      })
    ).gauges;
  }

  // calculate tvl
  data = await utils.tvl(data, chainString);

  // calculate apy
  data = data.map((entity) =>
    utils.apy(entity, dataPrior, dataPrior7d, version)
  );

  //ensure we have staking pool address and if not then filter out
  data = data.map((entity) => {
    const pool = chain.stakingPools.find(
      (f) => f.curveAddress.toLowerCase() === entity.id.toLowerCase()
    );

    if (!pool) {
      entity.stakingAddress = null;
      return entity;
    }
    entity.stakingAddress = pool.stakingAddress;
    return entity;
  });

  data = data.filter((entity) => entity.stakingAddress != null);

  data = await Promise.all(
    data.map(
      async (entity) =>
        await calculateRewardsApy(chainString, entity, gauges, chain)
    )
  );

  // build pool objects
  data = data.map((entity) => buildPool(entity, chainString));

  return data;
};

const main = async (timestamp = null) => {
  const data = await Promise.all(
    Object.keys(chains).map(async (chainString) => {
      const chain = chains[chainString];

      return await processPoolsOnChain(
        chainString,
        chain,
        timestamp,
        'arbidex'
      );
    })
  );

  return data.flat().filter((p) => utils.keepFinite(p));
};

module.exports = {
  timetravel: false,
  apy: main,
  url: 'https://exchange.dfx.finance/pools',
};
