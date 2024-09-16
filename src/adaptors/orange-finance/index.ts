const utils = require('../utils');
const { calculateAPR } = require('./strykeFee');
const BigNumber = require('bignumber.js');
const { chain, uniqBy } = require('lodash');
const { request } = require('graphql-request');

const orangeGraphUrl =
  'https://subgraph.satsuma-prod.com/1563a78cd0f9/pao-tech/orange-finance/api';
const strykeGraphUrl =
  'https://api.0xgraph.xyz/subgraphs/name/dopex-v2-clamm-public';

const {
  getStrykeVaultListQuery,
  getUniV3PoolListQuery,
  getStrykeLpPositionsListQuery,
  getDailyStrikeEarningsListQuery,
} = require('./query');

const vaultList = [
  '0xe1B68841E764Cc31be1Eb1e59d156a4ED1217c2C',
  '0x708790D732c5886D56b0cBBEd7b60ABF47848FaA',
  '0x01E371c500C49beA2fa985334f46A8Dc906253Ea',
  '0x22dd31a495CafB229131A16C54a8e5b2f43C1162',
  '0x5f6D5a7e8eccA2A53C6322a96e9a48907A8284e0',
  '0xE32132282D181967960928b77236B3c472d5f396',
  '0x3D2692Bb38686d0Fb9B1FAa2A3e2e5620EF112A9'
];

const fetchVaultData = async(vault, pool, ethPriceUSD, rewardsData) => {
  const dataDopexFirst = await request(
    strykeGraphUrl,
    getStrykeLpPositionsListQuery,
    { vaultIds: [vault.id] }
  );

  const tokenIds = dataDopexFirst?.lppositions.map(lpPosition => lpPosition.strike.id) ?? []

  const dataDopexSecond = await request(
    strykeGraphUrl,
    getDailyStrikeEarningsListQuery,
    { tokenIds, tokenIdsCount: tokenIds.length, startTime: Math.floor(new Date().getTime() / 1000) - 60 * 60 * 24 }
  );
  
  const lpPositions = dataDopexFirst?.lppositions ?? []
  const dailyDonations = uniqBy(dataDopexSecond?.dailyDonations, 'strike.id')
  const dailyFeeCompounds = uniqBy(dataDopexSecond?.dailyFeeCompounds, 'strike.id')
  const dopexStrikeEarnings = chain(lpPositions)
    .map(lpPosition => {
      const donation = dailyDonations.find(d => d.strike.id === lpPosition.strike.id)
      const compound = dailyFeeCompounds.find(c => c.strike.id === lpPosition.strike.id)
      if (!donation && !compound) {
        return null
      }

      return {
        sqrtPriceX96: donation?.sqrtPriceX96 ?? compound?.sqrtPriceX96,
        donation: donation?.donation ?? '0',
        compound: compound?.compound ?? '0',
        strike: lpPosition?.strike,
        pool: lpPosition.pool,
        shares: lpPosition.shares,
        user: lpPosition.user,
        handler: lpPosition.handler,
      }
    })
    .compact()
    .value()
  
  const stats = calculateAPR(dopexStrikeEarnings, vault, pool, ethPriceUSD)
  const vaultStats = {stats, vault, pool}
  const symbol = vaultStats.vault.isTokenPairReversed
    ? `${vaultStats.pool.token1.symbol}-${vaultStats.pool.token0.symbol}`
    : `${vaultStats.pool.token0.symbol}-${vaultStats.pool.token1.symbol}`
  const apyReward = rewardsData[vault.id]?.rewardAPR || 0
  return {
    pool: vaultStats.vault.id,
    chain: utils.formatChain('arbitrum'),
    project: 'orange-finance',
    symbol,
    apyBase: vaultStats.stats.dopexApr.toNumber() * 100,
    apyReward,
    tvlUsd: vaultStats.stats.tvl.toNumber(),
    poolMeta: 'LPDfi',
    rewardTokens: ["0x912CE59144191C1204E64559FE8253a0e49E6548"]
  }
}

async function getPools() {
  const dataOrange = await request(orangeGraphUrl, getStrykeVaultListQuery);

  const strykeVaults =
    dataOrange?.dopexVaults.filter((vault) => {
      return vaultList
        .map((address) => address.toLowerCase())
        .includes(vault.id.toLowerCase());
    }) ?? [];

  const dataUni = await request(orangeGraphUrl, getUniV3PoolListQuery, {
    poolIds: chain(strykeVaults).map((vault) => vault.pool).uniq().value(),
  });
  const ethPriceUSD = new BigNumber(dataUni.bundle.ethPriceUSD)

  const rewardsData = await (await fetch('https://raw.githubusercontent.com/orange-finance/resource/main/stats.json')).json()
  const formattedRewardsData = Object.fromEntries(
    Object.entries(rewardsData).map(([k, v]) => [k.toLowerCase(), v])
  );

  const stats = await Promise.all(strykeVaults.map(vault => {
    const pool = dataUni?.pools.find(pool => pool.id === vault?.pool)
    return fetchVaultData(vault, pool, ethPriceUSD, formattedRewardsData)
  }))
  return stats
}

module.exports = {
  timetravel: false,
  apy: getPools,
  url: 'https://app.orangefinance.io',
};