const sdk = require('@defillama/sdk');
const { request, gql } = require('graphql-request');
const {
  utils: { formatEther },
  constants: { WeiPerEther },
  BigNumber,
} = require('ethers');
const utils = require('../utils');
const { farmingRangeABI } = require('./abis');

const API_KEY = process.env.SMARDEX_SUBGRAPH_API_KEY;
const project = 'smardex-amm';

const BASE_URL = 'https://smardex.io/liquidity';
const DAYS_IN_YEAR = 365;
const SECONDS_IN_DAY = 86400;

// Smardex gateway for subgraph queries, for each chain
const ENDPOINT_BASE = 'https://subgraph.smardex.io/defillama';

// Smardex seed USDN token available on Ethereum
const SUSDN_TOKEN_ADDRESS = '0xf67e2dc041b8a3c39d066037d29f500757b1e886';
const SUSDE_TOKEN_ADDRESS = '0x9D39A5DE30e57443BfF2A8307A4256c8797A3497';

const CONFIG = {
  ethereum: {
    ENDPOINT: `${ENDPOINT_BASE}/ethereum`,
    SDEX_TOKEN_ADDRESS: '0x5de8ab7e27f6e7a1fff3e5b337584aa43961beef',
    FARMING_RANGE_ADDRESS: '0x7d85C0905a6E1Ab5837a0b57cD94A419d3a77523',
    TIME_BETWEEN_BLOCK: 12,
    STAKING_ADDRESS: '0x80497049b005Fd236591c3CD431DBD6E06eB1A31',
  },
  arbitrum: {
    ENDPOINT: `${ENDPOINT_BASE}/arbitrum`,
    SDEX_TOKEN_ADDRESS: '0xabD587f2607542723b17f14d00d99b987C29b074',
    FARMING_RANGE_ADDRESS: '0x53D165DF0414bD02E91747775450934BF2257f69',
    TIME_BETWEEN_BLOCK: 0.25,
  },
  polygon: {
    ENDPOINT: `${ENDPOINT_BASE}/polygon`,
    SDEX_TOKEN_ADDRESS: '0x6899fAcE15c14348E1759371049ab64A3a06bFA6',
    FARMING_RANGE_ADDRESS: '0x7DB73A1e526db36c40e508b09428420c1fA8e46b',
    TIME_BETWEEN_BLOCK: 2.2,
  },
  bsc: {
    ENDPOINT: `${ENDPOINT_BASE}/bsc`,
    SDEX_TOKEN_ADDRESS: '0xFdc66A08B0d0Dc44c17bbd471B88f49F50CdD20F',
    FARMING_RANGE_ADDRESS: '0xb891Aeb2130805171796644a2af76Fc7Ff25a0b9',
    TIME_BETWEEN_BLOCK: 3,
  },
  base: {
    ENDPOINT: `${ENDPOINT_BASE}/base`,
    SDEX_TOKEN_ADDRESS: '0xFd4330b0312fdEEC6d4225075b82E00493FF2e3f',
    FARMING_RANGE_ADDRESS: '0xa5D378c05192E3f1F365D6298921879C4D51c5a3',
    TIME_BETWEEN_BLOCK: 2,
  },
};

const EXCEPTIONS = {
  ethereum: [
    {
      tokenAddress: SUSDN_TOKEN_ADDRESS,
      symbol: 'sUSDN',
      customHandler: async ({
        chainString,
        block,
        farmsWithRewards,
        sdexPrice,
        BLOCKS_PER_YEAR,
        STAKING_ADDRESS,
      }) => {
        const prices = (
          await utils.getData(
            `https://coins.llama.fi/prices/current/${chainString}:${SUSDN_TOKEN_ADDRESS}`
          )
        ).coins;
        const susdnPrice =
          prices[`${chainString}:${SUSDN_TOKEN_ADDRESS}`]?.price || 0;
        const totalSupply =
          (
            await sdk.api.abi.call({
              target: SUSDN_TOKEN_ADDRESS,
              abi: 'erc20:totalSupply',
              chain: chainString,
            })
          ).output / 1e18;
        const rewardApy = campaignRewardAPY(
          farmsWithRewards.find(
            (farm) =>
              farm.pairAddress.toLowerCase() ===
              SUSDN_TOKEN_ADDRESS.toLowerCase()
          ),
          block,
          susdnPrice,
          sdexPrice,
          BLOCKS_PER_YEAR,
          STAKING_ADDRESS
        );

        const sUSDeApy = await getsUSDeApy(susdnPrice);
        const apyBase = rewardApy + sUSDeApy;
        return {
          pool: SUSDN_TOKEN_ADDRESS,
          symbol: 'sUSDN',
          project,
          chain: utils.formatChain(chainString),
          tvlUsd: totalSupply * susdnPrice,
          apyBase,
        };
      },
    },
  ],
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

const queryLastBlock = gql`
  {
    _meta {
      block {
        number
      }
    }
  }
`;

/**
 * GraphQL request helper function that authenticates to Smardex subgraph gateway
 */
const gqlRequest = (url, query, variables = null) => {
  return request(url, query, variables, {
    'x-api-key': API_KEY,
  });
};

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
        .slice(STAKING_ADDRESS ? 1 : 0)
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
        .slice(STAKING_ADDRESS ? 1 : 0)
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

const applyPoolExceptions = async (
  chainString,
  block,
  farmsWithRewards,
  sdexPrice,
  BLOCKS_PER_YEAR,
  STAKING_ADDRESS
) => {
  if (!EXCEPTIONS[chainString]) return [];

  const exceptions = EXCEPTIONS[chainString];
  const exceptionPools = [];

  for (const exception of exceptions) {
    const pool = await exception.customHandler({
      chainString,
      block,
      farmsWithRewards,
      sdexPrice,
      BLOCKS_PER_YEAR,
      STAKING_ADDRESS,
    });

    exceptionPools.push(pool);
  }
  return exceptionPools;
};

// Computes rewards as APY from Farming Campaigns
const campaignRewardAPY = (
  campaign,
  currentBlockNumber,
  poolPrice,
  sdexPrice,
  BLOCKS_PER_YEAR,
  STAKING_ADDRESS
) => {
  let apr = 0;
  if (
    sdexPrice &&
    campaign &&
    currentBlockNumber > campaign.startBlock &&
    campaign.rewards.length !== 0 &&
    parseInt(campaign.totalStaked) !== 0
  ) {
    for (let i = 0; i < campaign.rewards.length; i += 1) {
      const reward = campaign.rewards[i];

      if (currentBlockNumber < reward.endBlock) {
        const aprBN = reward.rewardPerBlock
          .mul(
            parseInt(campaign.id, 10) === 0 && STAKING_ADDRESS ? 1 : WeiPerEther
          )
          .mul(BLOCKS_PER_YEAR)
          .mul(100)
          .div(campaign.totalStaked);

        apr = (parseFloat(formatEther(aprBN)) * sdexPrice) / poolPrice;
        break;
      }
    }
  }

  return apr;
};

const topTvl = async (
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
    (SECONDS_IN_DAY * DAYS_IN_YEAR) / TIME_BETWEEN_BLOCK
  );
  const currentTimestamp = timestamp || Math.floor(Date.now() / 1000);
  const timestampPrior = currentTimestamp - SECONDS_IN_DAY;
  const timestampPrior7d = currentTimestamp - 7 * SECONDS_IN_DAY;

  let [block, blockPrior, blockPrior7d] = await utils.getBlocksByTime(
    [currentTimestamp, timestampPrior, timestampPrior7d],
    chainString
  );

  const lastIndexedBlock = (await gqlRequest(url, queryLastBlock))._meta.block
    .number;
  if (block > lastIndexedBlock) {
    // If the block is not indexed yet, we use the last indexed block
    block = lastIndexedBlock;
  }

  // pull data
  let queryC = query;
  let dataNow = (await gqlRequest(url, queryC.replace('<PLACEHOLDER>', block)))
    .pairs;
  // pull 24h offset data to calculate fees from swap volume
  let queryPriorC = queryPrior;
  const dataPrior = (
    await gqlRequest(url, queryPriorC.replace('<PLACEHOLDER>', blockPrior))
  ).pairs;

  // 7d offset
  const dataPrior7d = (
    await gqlRequest(url, queryPriorC.replace('<PLACEHOLDER>', blockPrior7d))
  ).pairs;

  dataNow = await utils.tvl(dataNow, chainString);
  dataNow = dataNow.map((el) =>
    utils.apy({ ...el, feeTier: 9000 }, dataPrior, dataPrior7d, version)
  );

  const prices = (
    await utils.getData(
      `https://coins.llama.fi/prices/current/${chainString}:${SDEX_TOKEN_ADDRESS}`
    )
  ).coins;
  const sdexPrice = prices[`${chainString}:${SDEX_TOKEN_ADDRESS}`]?.price || 0;
  const farmsWithRewards = await getFarmsWithRewards(
    chainString,
    STAKING_ADDRESS,
    FARMING_RANGE_ADDRESS
  );
  dataNow = dataNow.map((p) => {
    const symbol = utils.formatSymbol(`${p.token0.symbol}-${p.token1.symbol}`);
    const underlyingTokens = [p.token0.id, p.token1.id];
    const token0 = underlyingTokens === undefined ? '' : underlyingTokens[0];
    const token1 = underlyingTokens === undefined ? '' : underlyingTokens[1];
    const url = `${BASE_URL}/add?tokenA=${token0}&tokenB=${token1}`;
    const poolPrice =
      parseFloat(p.totalSupply) > 0
        ? (parseFloat(p.reserve0) * p.price0 +
            parseFloat(p.reserve1) * p.price1) /
          parseFloat(p.totalSupply)
        : 1;

    const apyReward = campaignRewardAPY(
      farmsWithRewards.find(
        (farm) => farm.pairAddress.toLowerCase() === p.id.toLowerCase()
      ),
      block,
      poolPrice,
      sdexPrice,
      BLOCKS_PER_YEAR,
      STAKING_ADDRESS
    );

    return {
      pool: p.id,
      chain: utils.formatChain(chainString),
      project,
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

  // Apply pool exceptions
  const exceptionPools = await applyPoolExceptions(
    chainString,
    block,
    farmsWithRewards,
    sdexPrice,
    BLOCKS_PER_YEAR,
    STAKING_ADDRESS
  );

  // Combine data with pool exceptions
  return [...dataNow, ...exceptionPools];
};

const main = async (timestamp = null) => {
  if (API_KEY === undefined) {
    throw new Error('Missing SMARDEX_SUBGRAPH_API_KEY environment variable');
  }
  // Getting configuration keys as array of chains
  const chains = Object.keys(CONFIG);

  // Fetching data for each chain in parallel
  const resultData = await Promise.allSettled(
    chains.map(async (chain) => {
      const data = await topTvl(
        chain,
        CONFIG[chain].ENDPOINT,
        query,
        queryPrior,
        'custom',
        timestamp
      );

      return data;
    })
  );

  return resultData
    .filter((i) => i.status === 'fulfilled')
    .map((i) => i.value)
    .flat()
    .filter(utils.keepFinite);
};

/**
 * NOTE:
 * This method is almost entirely taken from the Ethena adapter (src/adaptors/ethena/index.js)
 * We need to calculate the APY of sUSDe because sUSDN contains the yield of sUSDe.
 */
const getsUSDeApy = async (sUSDNPrice) => {
  const totalSupply =
    (
      await sdk.api.abi.call({
        target: SUSDE_TOKEN_ADDRESS,
        abi: 'erc20:totalSupply',
      })
    ).output / 1e18;

  const tvlUsd = totalSupply * sUSDNPrice;

  const currentBlock = await sdk.api.util.getLatestBlock('ethereum');
  const toBlock = currentBlock.number;
  const topic =
    '0xbb28dd7cd6be6f61828ea9158a04c5182c716a946a6d2f31f4864edb87471aa6';
  const logs = (
    await sdk.api.util.getLogs({
      target: '0x9D39A5DE30e57443BfF2A8307A4256c8797A3497',
      topic: '',
      toBlock,
      fromBlock: 19026137,
      keys: [],
      topics: [topic],
      chain: 'ethereum',
    })
  ).output.sort((a, b) => b.blockNumber - a.blockNumber);

  // rewards are now beeing streamed every 8hours, which we scale up to a year
  const rewardsReceived = parseInt(logs[0].data / 1e18);
  const aprBase = ((rewardsReceived * 3 * 365) / tvlUsd) * 100;
  // weekly compoounding
  const apyBase = utils.aprToApy(aprBase, 52);
  return apyBase;
};

module.exports = {
  timetravel: false,
  apy: main,
  url: BASE_URL,
};
