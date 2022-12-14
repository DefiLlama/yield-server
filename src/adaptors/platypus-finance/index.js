const sdk = require('@defillama/sdk');
const axios = require('axios');
const { gql, request } = require('graphql-request');

const abiVoter = require('./abiVoter');
const abiMasterPlatypusV4 = require('./abiMasterPlatypusV4');
const abiLP = require('./abiLP');
const abiBoostedMultiRewarder = require('./abiBoostedMultiRewarder');

const Voter = '0x1f6B6b505D199B9bd0a6642B8d44533a811598da';
const MasterPlatypusV4 = '0xfF6934aAC9C94E1C39358D4fDCF70aeca77D0AB0';
const PTP = '0x22d4002028f537599be9f666d1c4fa138522f9c8';

// only used to get poolMeta names
const POOLS_URL =
  'https://api.thegraph.com/subgraphs/name/platypus-finance/platypus-dashboard-staging';

const poolsQuery = gql`
  query MyQuery {
    assets {
      id
      pool {
        name
      }
    }
  }
`;

const apy = async () => {
  const poolLength = (
    await sdk.api.abi.call({
      target: MasterPlatypusV4,
      abi: abiMasterPlatypusV4.find((m) => m.name === 'poolLength'),
      chain: 'avax',
    })
  ).output;

  const poolInfo = (
    await sdk.api.abi.multiCall({
      calls: [...Array(Number(poolLength)).keys()].map((i) => ({
        target: MasterPlatypusV4,
        params: [i],
      })),
      abi: abiMasterPlatypusV4.find((m) => m.name === 'poolInfo'),
      chain: 'avax',
    })
  ).output.map((o) => o.output);

  const lpTokens = poolInfo.map((p) => p.lpToken);

  const ptpPerSec = (
    await sdk.api.abi.call({
      target: Voter,
      abi: abiVoter.find((m) => m.name === 'ptpPerSec'),
      chain: 'avax',
    })
  ).output;

  const totalWeight = (
    await sdk.api.abi.call({
      target: Voter,
      abi: abiVoter.find((m) => m.name === 'totalWeight'),
      chain: 'avax',
    })
  ).output;

  const weights = (
    await sdk.api.abi.multiCall({
      calls: lpTokens.map((lpToken) => ({ target: Voter, params: [lpToken] })),
      abi: abiVoter.find((m) => m.name === 'weights'),
      chain: 'avax',
    })
  ).output.map((o) => o.output);

  const dilutingRepartition = (
    await sdk.api.abi.call({
      target: MasterPlatypusV4,
      abi: abiMasterPlatypusV4.find((m) => m.name === 'dilutingRepartition'),
      chain: 'avax',
    })
  ).output;

  const underlyingTokens = (
    await sdk.api.abi.multiCall({
      calls: lpTokens.map((lpToken) => ({ target: lpToken })),
      abi: abiLP.find((m) => m.name === 'underlyingToken'),
      chain: 'avax',
    })
  ).output.map((o) => o.output);

  const symbols = (
    await sdk.api.abi.multiCall({
      calls: underlyingTokens.map((underlying) => ({
        target: underlying,
      })),
      abi: 'erc20:symbol',
      chain: 'avax',
    })
  ).output.map((o) => o.output);

  const totalSupply = (
    await sdk.api.abi.multiCall({
      calls: lpTokens.map((lp) => ({
        target: lp,
      })),
      abi: abiLP.find((m) => m.name === 'totalSupply'),
      chain: 'avax',
    })
  ).output.map((o) => o.output);

  const decimals = (
    await sdk.api.abi.multiCall({
      calls: lpTokens.map((lp) => ({
        target: lp,
      })),
      abi: abiLP.find((m) => m.name === 'decimals'),
      chain: 'avax',
    })
  ).output.map((o) => o.output);

  const rewarderPoolInfo = (
    await sdk.api.abi.multiCall({
      calls: poolInfo.map((p) => ({
        target: p.rewarder,
        params: [0],
      })),
      abi: abiBoostedMultiRewarder.find((m) => m.name === 'poolInfo'),
      chain: 'avax',
    })
  ).output.map((o) => o.output);

  const priceKeys = underlyingTokens
    .concat(PTP)
    .concat(
      rewarderPoolInfo.filter((r) => r !== null).map((r) => r.rewardToken)
    )
    .map((u) => `avax:${u}`)
    .join(',');

  const prices = (
    await axios.get(`https://coins.llama.fi/prices/current/${priceKeys}`)
  ).data.coins;

  // for pool names (eg Main Pool, BTC pool etc)
  const { assets } = await request(POOLS_URL, poolsQuery);

  // dilutingRepartition is what goes to base APR, the rest to those who boost
  const rewardBasePartition = dilutingRepartition / 1e3;

  const ptpPerYearUsd =
    (ptpPerSec / 1e18) *
    86400 *
    365 *
    rewardBasePartition *
    prices[`avax:${PTP}`].price;

  return lpTokens
    .map((t, i) => {
      const tvlUsd =
        (totalSupply[i] / 10 ** decimals[i]) *
        prices[`avax:${underlyingTokens[i]}`]?.price;
      const apyRewardPTP =
        ((ptpPerYearUsd * weights[i]) / totalWeight / tvlUsd) * 100;

      const rewardTokens = apyRewardPTP > 0 ? [PTP] : [];

      // any other pool rewards eg avax, benqi etc.
      let apyRewardExtra = 0;
      if (rewarderPoolInfo[i] !== null) {
        const extraRewardToken = rewarderPoolInfo[i].rewardToken;
        const tokenPerSec = rewarderPoolInfo[i].tokenPerSec;
        const priceData = prices[`avax:${extraRewardToken}`];
        const extraPerYearUsd =
          (tokenPerSec / 1e18) *
          86400 *
          365 *
          rewardBasePartition *
          priceData.price;
        apyRewardExtra = (extraPerYearUsd / tvlUsd) * 100;
        if (apyRewardExtra > 0) rewardTokens.push(extraRewardToken);
      }

      return {
        pool: t,
        symbol: symbols[i],
        chain: 'avalanche',
        project: 'platypus-finance',
        tvlUsd,
        apyReward: apyRewardPTP + apyRewardExtra,
        underlyingTokens: [underlyingTokens[i]],
        rewardTokens,
        poolMeta: assets.find((a) => a.id.toLowerCase() === t.toLowerCase())
          ?.pool?.name,
      };
    })
    .filter(
      (p) =>
        p.tvlUsd > 0 &&
        ![
          '0xFC95481F79eC965A535Ed8cef4630e1dd308d319', // UST pool
          '0xc7388D98Fa86B6639d71A0A6d410D5cDfc63A1d0', // UST pool
        ].includes(p.pool)
    );
};

module.exports = {
  timetravel: false,
  apy,
  url: 'https://app.platypus.finance/pool',
};
