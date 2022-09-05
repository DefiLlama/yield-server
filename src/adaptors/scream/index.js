const superagent = require('superagent');
const { request, gql } = require('graphql-request');
const Web3 = require('web3');

const utils = require('../utils');
const { comptrollerABI } = require('./abi');

const FTM_RPC = 'https://rpc.ankr.com/fantom/';
const API_URL = 'https://api.thegraph.com/subgraphs/name/0xc30/scream';
const COMPTROLLER_ADDRESS = '0x3d3094Aec3b63C744b9fe56397D36bE568faEBdF';

const BLOCK_TIME = 1;
const BLOCKS_PER_YEAR = BLOCK_TIME * 60 * 60 * 24 * 365;

const query = gql`
  {
    markets {
      id
      underlyingSymbol
      supplyRate
      cash
      underlyingPriceUSD
      totalBorrows
    }
  }
`;

const web3 = new Web3(FTM_RPC);

const getRewardTokenApr = async (marketsData) => {
  const key = 'fantom:0xe0654c8e6fd4d733349ac7e09f6f23da256bf475';
  const rewardTokenPrice = (
    await superagent.post('https://coins.llama.fi/prices').send({
      coins: [key],
    })
  ).body.coins[key].price;

  const comptroller = new web3.eth.Contract(
    comptrollerABI,
    COMPTROLLER_ADDRESS
  );

  const rewardsPerBlock = await Promise.all(
    marketsData.map(async (market) => ({
      market: market.id,
      reward: await comptroller.methods.compSpeeds(market.id).call(),
      totalSupplyUSD:
        (Number(market.cash) + Number(market.totalBorrows)) *
        Number(market.underlyingPriceUSD),
    }))
  );

  const apr = rewardsPerBlock.reduce(
    (acc, { market, reward, totalSupplyUSD }) => {
      return {
        ...acc,
        [market.toLowerCase()]:
          (((reward / 10 ** 18) * BLOCKS_PER_YEAR * rewardTokenPrice) /
            totalSupplyUSD) *
          100,
      };
    },
    {}
  );

  return apr;
};

const getApy = async () => {
  const marketsData = await request(API_URL, query);

  const rewardTokenApr = await getRewardTokenApr(marketsData.markets);

  const pools = marketsData.markets.map((market) => {
    return {
      pool: market.id,
      chain: utils.formatChain('fantom'),
      project: 'scream',
      symbol: market.underlyingSymbol,
      tvlUsd: market.underlyingPriceUSD * market.cash,
      apy:
        Number(market.supplyRate) * 100 +
        rewardTokenApr[market.id.toLowerCase()],
    };
  });

  return pools;
};

module.exports = {
  timetravel: false,
  apy: getApy,
  url: 'https://scream.sh/lend',
};
