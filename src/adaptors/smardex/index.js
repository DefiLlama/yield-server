const sdk = require('@defillama/sdk');
const { request, gql } = require('graphql-request');
const {
  utils: { formatEther },
  constants: { WeiPerEther },
  BigNumber,
} = require('ethers');
const utils = require('../utils');
const { farmingRangeABI } = require('./abis');

const BASE_URL = 'https://smardex.io/liquidity';
const DAYS_IN_YEAR = 365;
const DAYS_IN_WEEK = 7;
const SECONDS_IN_DAY = 86400;

const CONFIG = {
  ethereum: {
    ENDPOINT:
      'https://api.studio.thegraph.com/query/41381/smardex-volumes/v0.0.7',
    SDEX_TOKEN_ADDRESS: '0x5de8ab7e27f6e7a1fff3e5b337584aa43961beef',
    FARMING_RANGE_ADDRESS: '0xe74A7a544534DA80fBaC4d2475a6fDc03388154f',
    TIME_BETWEEN_BLOCK: 12,
    STAKING_ADDRESS: '0xb940d63c2ded1184bbde059acc7fee93654f02bf',
  },
};

const query = gql`
  {
    pairs(first: 500, orderBy: reserveUSD, orderDirection: desc block: {number: <PLACEHOLDER>}) {
      id
      reserve0
      reserve1
      fictiveReserve0
      fictiveReserve1
      volumeUSD
      totalSupply
      token0 {
        symbol
        id
      }
      token1 {
        symbol
        id
      }
    }
  }
`;

const queryPrior = gql`
  {
    pairs (first: 500 orderBy: reserveUSD orderDirection: desc block: {number: <PLACEHOLDER>}) { 
      id
      volumeUSD
    }
  }
`;

const getFarmsWithRewards = async (
  chainString,
  STAKING_ADDRESS,
  FARMING_RANGE_ADDRESS
) => {
  // Get staking total shares and campaigns length
  const campaignInfoLen = (
    await sdk.api.abi.call({
      target: FARMING_RANGE_ADDRESS,
      abi: farmingRangeABI.find(({ name }) => name === 'campaignInfoLen'),
      chain: chainString,
    })
  ).output;

  // Get each campaigns info and rewards length
  const [campaignInfos, rewardInfoLens] = await Promise.all([
    sdk.api.abi.multiCall({
      target: FARMING_RANGE_ADDRESS,
      abi: farmingRangeABI.find(({ name }) => name === 'campaignInfo'),
      chain: chainString,
      calls: [...Array.from(Array(parseInt(campaignInfoLen, 10)).keys())]
        .slice(1)
        .map((campaignId) => ({
          target: FARMING_RANGE_ADDRESS,
          params: [campaignId],
        })),
    }),
    sdk.api.abi.multiCall({
      target: FARMING_RANGE_ADDRESS,
      abi: farmingRangeABI.find(({ name }) => name === 'rewardInfoLen'),
      chain: chainString,
      calls: [...Array.from(Array(parseInt(campaignInfoLen, 10)).keys())]
        .slice(1)
        .map((campaignId) => ({
          target: FARMING_RANGE_ADDRESS,
          params: [campaignId],
        })),
    }),
  ]);

  const campaignRewardInfoCalls = [];
  rewardInfoLens.output.forEach((rewardInfoLen) => {
    const campaignRewardLength = parseInt(rewardInfoLen.output, 10);

    for (
      let rewardInfoId = 0;
      rewardInfoId < campaignRewardLength;
      rewardInfoId += 1
    ) {
      campaignRewardInfoCalls.push({
        methodName: FARMING_RANGE_ADDRESS,
        params: [rewardInfoLen.input.params[0], rewardInfoId.toString()],
      });
    }
  });

  // Get all segments of reward info per campaign
  const campaignRewardInfo = (
    await sdk.api.abi.multiCall({
      target: FARMING_RANGE_ADDRESS,
      abi: farmingRangeABI.find(({ name }) => name === 'campaignRewardInfo'),
      chain: chainString,
      calls: campaignRewardInfoCalls,
    })
  ).output;

  // Build campaigns with attributes
  const farmsWithRewards = [];
  campaignInfos.output.forEach(({ input, output }) => {
    const campaignId = input.params[0].toString();
    const rewards = campaignRewardInfo
      .filter(
        (campaignRewards) =>
          campaignRewards.success &&
          campaignRewards.input.params[0].toString() === campaignId
      )
      .map((campaignRewards) => ({
        endBlock: parseInt(campaignRewards.output.endBlock, 10),
        rewardPerBlock: BigNumber.from(campaignRewards.output.rewardPerBlock),
      }))
      .sort((a, b) => (a.endBlock > b.endBlock ? 1 : -1));

    farmsWithRewards.push({
      id: campaignId,
      pairAddress: output.stakingToken,
      startBlock: parseInt(output.startBlock, 10),
      lastRewardBlock: parseInt(output.lastRewardBlock, 10),
      // accRewardPerShare: BigNumber.from(output.accRewardPerShare),
      totalStaked: BigNumber.from(output.totalStaked),
      totalRewards: BigNumber.from(output.totalRewards),
      rewards,
    });
  });

  return farmsWithRewards;
};

// Computes rewards as APY from Farming Campaigns
const campaignRewardAPY = (
  campaign,
  pair,
  currentBlockNumber,
  sdexPrice,
  BLOCKS_PER_YEAR
) => {
  let apr = 0;

  if (
    sdexPrice &&
    campaign &&
    currentBlockNumber > campaign.startBlock &&
    campaign.rewards.length !== 0 &&
    parseInt(campaign.totalStaked) !== 0
  ) {
    const pairPrice =
      parseFloat(pair.totalSupply) > 0
        ? (parseFloat(pair.reserve0) * pair.price0 +
            parseFloat(pair.reserve1) * pair.price1) /
          parseFloat(pair.totalSupply)
        : 1;

    for (let i = 0; i < campaign.rewards.length; i += 1) {
      const reward = campaign.rewards[i];

      if (currentBlockNumber < reward.endBlock) {
        const aprBN = reward.rewardPerBlock
          .mul(parseInt(campaign.id, 10) === 0 ? 1 : WeiPerEther)
          .mul(BLOCKS_PER_YEAR)
          .mul(100)
          .div(campaign.totalStaked);

        apr = (parseFloat(formatEther(aprBN)) * sdexPrice) / pairPrice;

        break;
      }
    }
  }

  return apr;
};

const topLvl = async (
  chainString,
  url,
  query,
  queryPrior,
  version,
  timestamp
) => {
  const {
    SDEX_TOKEN_ADDRESS,
    FARMING_RANGE_ADDRESS,
    TIME_BETWEEN_BLOCK,
    STAKING_ADDRESS,
  } = CONFIG[chainString];
  const BLOCKS_PER_YEAR = Math.floor(
    (60 * 60 * 24 * DAYS_IN_YEAR) / TIME_BETWEEN_BLOCK
  );

  const currentTimestamp = timestamp || Math.floor(Date.now() / 1000);
  const timestampPrior = currentTimestamp - SECONDS_IN_DAY;
  const timestampPrior7d = currentTimestamp - 7 * SECONDS_IN_DAY;

  let [block, blockPrior, blockPrior7d] = await utils.getBlocksByTime(
    [currentTimestamp, timestampPrior, timestampPrior7d],
    chainString
  );

  // pull data
  let queryC = query;
  let dataNow = (await request(url, queryC.replace('<PLACEHOLDER>', block)))
    .pairs;

  // pull 24h offset data to calculate fees from swap volume
  let queryPriorC = queryPrior;
  const dataPrior = (
    await request(url, queryPriorC.replace('<PLACEHOLDER>', blockPrior))
  ).pairs;

  // 7d offset
  const dataPrior7d = (
    await request(url, queryPriorC.replace('<PLACEHOLDER>', blockPrior7d))
  ).pairs;

  // calculate tvl
  dataNow = await utils.tvl(dataNow, chainString);
  // calculate apy
  dataNow = dataNow.map((el) =>
    utils.apy({ ...el, feeTier: 500 }, dataPrior, dataPrior7d, version)
  );

  const prices = (
    await utils.getData(
      `https://coins.llama.fi/prices/current/${chainString}:${SDEX_TOKEN_ADDRESS}`
    )
  ).coins;
  const sdexPrice = prices[`${chainString}:${SDEX_TOKEN_ADDRESS}`].price;

  // Get farming campagns for APY rewards
  const farmsWithRewards = await getFarmsWithRewards(
    chainString,
    STAKING_ADDRESS,
    FARMING_RANGE_ADDRESS
  );

  return dataNow.map((p) => {
    const symbol = utils.formatSymbol(`${p.token0.symbol}-${p.token1.symbol}`);
    const underlyingTokens = [p.token0.id, p.token1.id];
    const token0 = underlyingTokens === undefined ? '' : underlyingTokens[0];
    const token1 = underlyingTokens === undefined ? '' : underlyingTokens[1];
    const url = `${BASE_URL}/add?tokenA=${token0}&tokenB=${token1}`;

    const apyReward = campaignRewardAPY(
      farmsWithRewards.find(
        (farm) => farm.pairAddress.toLowerCase() === p.id.toLowerCase()
      ),
      p,
      block,
      sdexPrice,
      BLOCKS_PER_YEAR
    );

    return {
      pool: p.id,
      chain: utils.formatChain(chainString),
      project: 'smardex',
      symbol,
      tvlUsd: p.totalValueLockedUSD,
      apyBase: p.apy1d,
      apyBase7d: p.apy7d,
      apyReward,
      rewardTokens: apyReward > 0 ? [SDEX_TOKEN_ADDRESS] : [],
      underlyingTokens,
      url,
      volumeUsd1d: p.volumeUSD1d,
      volumeUsd7d: p.volumeUSD7d,
    };
  });
};

const main = async (timestamp = null) => {
  const chainString = 'ethereum';

  let data = await topLvl(
    chainString,
    CONFIG[chainString].ENDPOINT,
    query,
    queryPrior,
    'custom',
    timestamp
  );

  return data.filter((p) => utils.keepFinite(p));
};

module.exports = {
  timetravel: false,
  apy: main,
  url: BASE_URL,
};
