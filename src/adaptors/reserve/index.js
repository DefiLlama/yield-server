const utils = require('../utils');

const superagent = require('superagent');
const { request, gql } = require('graphql-request');
const ethers = require('ethers');
const { default: BigNumber } = require('bignumber.js');
const sdk = require('@defillama/sdk');

const { facadeAbi, rtokenAbi } = require('./abi');

const CHAIN = 'ethereum';
const FACADE_ADDRESS = '0xad0BFAEE863B1102e9fD4e6330A02B08d885C715';
const graphEndpoint =
  'https://api.thegraph.com/subgraphs/name/lcamargof/reserve-test';

const rtokenQuery = gql`
  {
    rtokens(orderBy: cumulativeUniqueUsers, orderDirection: desc) {
      id
      cumulativeUniqueUsers
      targetUnits
      rsrStaked
      rsrPriceUSD
      token {
        name
        symbol
        lastPriceUSD
        holderCount
        transferCount
        totalSupply
        cumulativeVolume
      }
    }
  }
`;

const poolsMap = {
  '405d8dad-5c99-4c91-90d3-82813ade1ff1': 'sadai',
  'a349fea4-d780-4e16-973e-70ca9b606db2': 'sausdc',
  '60d657c9-5f63-4771-a85b-2cf8d507ec00': 'sausdt',
  '1d53fa29-b918-4d74-9508-8fcf8173ca51': 'sausdp',
  'cc110152-36c2-4e10-9c12-c5b4eb662143': 'cdai',
  'cefa9bb8-c230-459a-a855-3b94e96acd8c': 'cusdc',
  '57647093-2868-4e65-97ab-9cae8ec74e7d': 'cusdt',
  '6c2b7a5c-6c4f-49ea-a08c-0366b772f2c2': 'cusdp',
  '1d876729-4445-4623-8b6b-c5290db5d100': 'cwbtc',
  '1e5da7c6-59bb-49bd-9f97-4f4fceeffad4': 'ceth',
  'fa4d7ee4-0001-4133-9e8d-cf7d5d194a91': 'fusdc',
  'ed227286-abb0-4a34-ada5-39f7ebd81afb': 'fdai',
  '6600934f-6323-447d-8a7d-67fbede8529d': 'fusdt',
  '747c1d2a-c668-4682-b9f9-296708a3dd90': 'wsteth',
  'd4b3c522-6127-4b89-bedf-83641cdcd2eb': 'reth',
  '7da72d09-56ca-4ec5-a45f-59114353e487': 'wcusdcv3',
  '8a20c472-142c-4442-b724-40f2183c073e': 'stkcvxmim-3lp3crv-f',
  'ad3d7253-fb8f-402f-a6f8-821bc0a055cb': 'stkcvxcrv3crypto',
  '7394f1bc-840a-4ff0-9e87-5e0ef932943a': 'stkcvx3crv',
  'c04005c9-7e34-41a6-91c4-295834ed8ac0': 'stkcvxeusd3crv-f',
  'fa4d7ee4-0001-4133-9e8d-cf7d5d194a91': 'fusdc-vault',
  '325ad2d6-70b1-48d7-a557-c2c99a036f87': 'mrp-ausdc',
};

const rtokenTvl = (rtoken) =>
  (rtoken.token?.totalSupply / 1e18) * rtoken.token?.lastPriceUSD || 0;

const main = async () => {
  const poolsData = (await utils.getData('https://yields.llama.fi/pools'))
    ?.data;

  const poolsInfo = {};
  if (poolsData) {
    for (const pool of poolsData) {
      if (poolsMap[pool.pool]) {
        poolsInfo[poolsMap[pool.pool]] = {
          yield: pool.apyMean30d || 0,
          underlyings: pool.underlyingTokens,
        };
      }
    }
  }
  const { rtokens } = await request(graphEndpoint, rtokenQuery);

  const filteredRtokens = rtokens.filter(
    (rtoken) => rtoken && rtokenTvl(rtoken) > 10_000
  );

  const rtokenAddresses = filteredRtokens.map((rtoken) => rtoken.id);

  const { output: mainAddresses } = await sdk.api.abi.multiCall({
    abi: rtokenAbi.find(({ name }) => name === 'main'),
    calls: rtokenAddresses.map((rtokenAddress) => ({
      target: rtokenAddress,
      params: [],
    })),
  });

  const { output: distributorAddresses } = await sdk.api.abi.multiCall({
    abi: rtokenAbi.find(({ name }) => name === 'distributor'),
    calls: mainAddresses.map(({ output: mainAddress }) => ({
      target: mainAddress,
      params: [],
    })),
  });

  const { output: distributions } = await sdk.api.abi.multiCall({
    abi: rtokenAbi.find(({ name }) => name === 'distribution'),
    calls: distributorAddresses.map(({ output: distributorAddress }) => ({
      target: distributorAddress,
      params: ['0x0000000000000000000000000000000000000001'],
    })),
  });

  const { output: basketBreakdowns } = await sdk.api.abi.multiCall({
    abi: facadeAbi.find(({ name }) => name === 'basketBreakdown'),
    calls: rtokenAddresses.map((rtokenAddress) => ({
      target: FACADE_ADDRESS,
      params: [rtokenAddress],
    })),
  });

  const reservePools = Promise.all(
    filteredRtokens.map(async (rtoken, i) => {
      if (!rtoken) return null;

      const { output: symbols } = await sdk.api.abi.multiCall({
        abi: 'erc20:symbol',
        calls: basketBreakdowns[i].output.erc20s.map((erc20) => ({
          target: erc20,
          params: [],
        })),
      });

      let apyBase = BigNumber(0);
      let totalShares = BigNumber(0);
      const underlyingTokens = [];

      for (let j = 0; j < symbols.length; j++) {
        const token = basketBreakdowns[i].output.erc20s[j];
        const shares = new BigNumber(basketBreakdowns[i].output.uoaShares[j]);
        totalShares = totalShares.plus(shares);

        const pool = poolsInfo[symbols[j]?.output?.toLowerCase()];

        if (pool?.yield)
          apyBase = apyBase.plus(shares.times(new BigNumber(pool.yield)));

        if (pool?.underlyings?.length)
          underlyingTokens.push(...pool.underlyings);
      }

      if (!totalShares.isZero()) {
        apyBase = apyBase.div(totalShares);
      }

      return {
        pool: rtoken.id,
        chain: CHAIN,
        project: 'reserve',
        symbol: rtoken.token?.symbol,
        tvlUsd: rtokenTvl(rtoken),
        apyBase:
          (apyBase.toNumber() * (distributions[i].output.rTokenDist || 10000)) /
          10000, // Revenue distribution to holders
        apyReward: 0,
        rewardTokens: [],
        underlyingTokens: underlyingTokens,
        url: `https://register.app/#/overview?token=${rtoken.id}`,
      };
    })
  );

  return reservePools;
};

module.exports = {
  timetravel: false,
  apy: main,
};
