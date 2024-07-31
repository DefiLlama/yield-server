//const {Web3} = require('web3');
//const { default: BigNumber } = require('bignumber.js');
const sdk = require('@defillama/sdk');
const { request, gql } = require('graphql-request');

const { factoryABI, lpTokenABI } = require('./abi');
const utils = require('../utils');
const axios = require('axios');

//const web3 = new Web3(RPC_URL);
const RPC_URL = 'https://mainnet.zksync.io/';
const GRAPH =
  'https://api.goldsky.com/api/public/project_clmtie4nnezuh2nw6hhjg6mo7/subgraphs/mute_switch/v0.0.7/gn';
const BLOCK_GRAPH =
  'https://api.studio.thegraph.com/query/12332/blocks---zksync-era/version/latest';
const AMPS = 'https://raw.githubusercontent.com/muteio/farms/main/index.json';

const FACTORY = '0x40be1cBa6C5B47cDF9da7f963B6F761F4C60627D';

const query = gql`
  {
    pairs(first: 1000, orderBy: trackedReserveETH, orderDirection: desc block: {number: <PLACEHOLDER>}) {
      id
      pairFee
      reserve0
      reserve1
      volumeUSD
      token0 {
        symbol
        id
      }
      token1 {
        symbol
        id
      }
      stable
    }
  }
`;

const queryPrior = gql`
  {
    pairs (first: 1000 orderBy: trackedReserveETH orderDirection: desc block: {number: <PLACEHOLDER>}) { 
      id 
      volumeUSD 
      pairFee
      stable
    }
  }
`;

const apy = (pool, dataPrior1d, dataPrior7d) => {
  pool = { ...pool };

  pool['feeTier'] = pool.pairFee;

  // calc prior volume on 24h offset
  pool['volumeUSDPrior1d'] = dataPrior1d.find(
    (el) => el.id === pool.id
  )?.volumeUSD;

  pool['volumeUSDPrior7d'] = dataPrior7d.find(
    (el) => el.id === pool.id
  )?.volumeUSD;

  // calc 24h volume
  pool['volumeUSD1d'] = Number(pool.volumeUSD) - Number(pool.volumeUSDPrior1d);
  pool['volumeUSD7d'] = Number(pool.volumeUSD) - Number(pool.volumeUSDPrior7d);

  // calc fees
  pool['feeUSD1d'] = (pool.volumeUSD1d * Number(pool.feeTier)) / 10000;
  pool['feeUSD7d'] = (pool.volumeUSD7d * Number(pool.feeTier)) / 10000;

  // annualise
  pool['feeUSDyear1d'] = pool.feeUSD1d * 365;
  pool['feeUSDyear7d'] = pool.feeUSD7d * 52;

  // calc apy
  pool['apy1d'] = (pool.feeUSDyear1d / pool.totalValueLockedUSD) * 100;
  pool['apy7d'] = (pool.feeUSDyear7d / pool.totalValueLockedUSD) * 100;

  return pool;
};

const topLvl = async (
  chainString,
  url,
  block_url,
  query,
  queryPrior,
  timestamp
) => {
  const farms = (await axios.get(AMPS)).data;
  var farmRewards = {};

  for (let i in farms) {
    farmRewards[farms[i].pair.toLowerCase()] = {
      apy: farms[i].apy,
      payout: farms[i].payoutToken,
    };
  }

  const [block, blockPrior] = await utils.getBlocks(chainString, timestamp, [
    block_url,
  ]);

  const [_, blockPrior7d] = await utils.getBlocks(
    chainString,
    timestamp,
    [block_url],
    604800
  );

  // pull data
  let queryC = query;
  let dataNow = await request(url, queryC.replace('<PLACEHOLDER>', block));
  dataNow = dataNow.pairs;

  // pull 24h offset data to calculate fees from swap volume
  let queryPriorC = queryPrior;
  let dataPrior = await request(
    url,
    queryPriorC.replace('<PLACEHOLDER>', blockPrior)
  );
  dataPrior = dataPrior.pairs;

  // 7d offset
  const dataPrior7d = (
    await request(url, queryPriorC.replace('<PLACEHOLDER>', blockPrior7d))
  ).pairs;

  // calculate tvl
  dataNow = await utils.tvl(dataNow, chainString);
  // calculate apy
  dataNow = dataNow.map((el) => apy(el, dataPrior, dataPrior7d));

  return dataNow.map((p) => {
    const symbol = utils.formatSymbol(`${p.token0.symbol}-${p.token1.symbol}`);
    const underlyingTokens = [p.token0.id, p.token1.id];
    const token0 = underlyingTokens === undefined ? '' : underlyingTokens[0];
    const token1 = underlyingTokens === undefined ? '' : underlyingTokens[1];
    const url = `https://dapp.koi.finance/pool/${token0}/${token1}/${p.stable}`;

    const apyReward = farmRewards[p.id.toLowerCase()]
      ? farmRewards[p.id.toLowerCase()].apy / 100
      : 0;
    const rewardTokens = farmRewards[p.id.toLowerCase()]
      ? [...underlyingTokens, farmRewards[p.id.toLowerCase()].payout]
      : underlyingTokens;

    return {
      pool: p.id,
      chain: utils.formatChain(chainString),
      project: 'koi-finance-amm',
      symbol,
      tvlUsd: p.totalValueLockedUSD,
      apyBase: p.apy1d,
      apyBase7d: p.apy7d,
      underlyingTokens,
      url,
      volumeUsd1d: p.volumeUSD1d,
      volumeUsd7d: p.volumeUSD7d,
      apyReward,
      rewardTokens,
    };
  });
};

const main = async (timestamp = null) => {
  let data = await topLvl(
    'era',
    GRAPH,
    BLOCK_GRAPH,
    query,
    queryPrior,
    timestamp
  );

  return data.filter((p) => utils.keepFinite(p));
};

module.exports = {
  timetravel: false,
  apy: main,
  url: 'https://koi.finance/farms',
};
