const utils = require('../utils');
const { calculateAPR } = require('./strykeFee');
const BigNumber = require('bignumber.js');
const { chain } = require('lodash');
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

const vaultList = ['0xe1B68841E764Cc31be1Eb1e59d156a4ED1217c2C'];

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

  const dataStryke1 = await request(
    strykeGraphUrl,
    getStrykeLpPositionsListQuery,
    { vaultIds: strykeVaults.map((vault) => vault.id) }
  );

  const tokenIds = dataStryke1?.lppositions.map(lpPosition => lpPosition.strike.id) ?? []

  const dataStryke2 = await request(
    strykeGraphUrl,
    getDailyStrikeEarningsListQuery,
    { tokenIds, tokenIdsCount: tokenIds.length }
  );

  const strikeEarningsDict = chain(dataStryke1?.lppositions ?? [])
    .map(lpPosition => {
      const donation = dataStryke2?.dailyDonations.find(
        d => d.strike.id === lpPosition.strike.id
      )
      const compound = dataStryke2?.dailyFeeCompounds.find(c => c.id === donation?.id)
      return {
        sqrtPriceX96: donation?.sqrtPriceX96,
        donation: donation?.donation,
        compound: compound?.compound,
        strike: lpPosition?.strike,
        pool: lpPosition.pool,
        shares: lpPosition.shares,
        user: lpPosition.user,
        handler: lpPosition.handler,
      }
    })
    .groupBy('user')
    .value()

  const ethPriceUSD = new BigNumber(dataUni.bundle.ethPriceUSD)

  const statsList = chain(strykeVaults)
    .map(vault => {
      const dopexStrikeEarnings = strikeEarningsDict[vault.id]
      const pool = dataUni?.pools.find(pool => pool.id === vault?.pool)
      if (!vault || !pool) {
        return
      }
      const stats = calculateAPR(dopexStrikeEarnings, vault, pool, ethPriceUSD)
      return { stats, vault, pool }
    })
    .compact()
    .map(vaultStats => {
      const symbol = vaultStats.vault.isTokenPairReversed
        ? `${vaultStats.pool.token1.symbol}-${vaultStats.pool.token0.symbol}`
        : `${vaultStats.pool.token0.symbol}-${vaultStats.pool.token1.symbol}`
      return {
        pool: vaultStats.vault.id,
        chain: utils.formatChain('arbitrum'),
        project: 'orange-finance',
        symbol,
        apyBase: vaultStats.stats.dopexApr.toNumber() * 100,
        tvlUsd: vaultStats.stats.tvl.toNumber(),
        poolMeta: 'LPDfi'
      }
    })
    .value()

  return statsList
}

module.exports = {
  timetravel: false,
  apy: getPools,
  url: 'https://app.orangefinance.io',
};