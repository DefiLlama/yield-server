const utils = require('../utils');
const { gql, default: request } = require('graphql-request');
const { getTvl } = require('./contract');
const { getApy } = require('./contract');

const ARKIVER_GRAPHQL_URL =
  'https://data.arkiver.net/s_battenally/vaults/graphql';
const VAULT_STATS_URL =
  'https://api.thegraph.com/subgraphs/name/xayaneu/neutra-vault-migration';

const poolsFunction = async () => {
  const nGlpQuery = gql`
    {
      vaults(first: 1, orderDirection: desc) {
        id
        nGlpPrice
        esNeuApr
        nGlpApr
      }
    }
  `;

  const nUSDCQuery = gql`
    query GetVaultApy {
      VaultApy(
        filter: { vault: "0x2a958665bC9A1680135241133569C7014230Cb21" }
        sort: TIMESTAMP_DESC
      ) {
        apy1d
        apy7d
      }
    }
  `;

  let nusdcAPY = await request(ARKIVER_GRAPHQL_URL, nUSDCQuery);

  let nGlpAPY = await request(VAULT_STATS_URL, nGlpQuery);

  const tvl = await getTvl();
  const getAPY = await getApy();

  const GlpPool = {
    pool: '0x6Bfa4F1DfAfeb9c37E4E8d436E1d0C5973E47e25',
    chain: utils.formatChain('arbitrum'),
    project: 'neutra-finance',
    symbol: utils.formatSymbol('DAI'),
    tvlUsd: Number(tvl[1]),
    apyReward:
      (Number(nGlpAPY.vaults[0].esNeuApr) + Number(nGlpAPY.vaults[0].nGlpApr)) /
      1e18,
    rewardTokens: [
      '0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1',
      '0x22F4730e21e40Dc751c08826d93010A64185e53f',
    ],
  };

  const nUSDCPool = {
    pool: '0x2a958665bC9A1680135241133569C7014230Cb21',
    chain: utils.formatChain('arbitrum'),
    project: 'neutra-finance',
    symbol: utils.formatSymbol('USDC'),
    tvlUsd: Number(tvl[0]),
    apyReward: getAPY,
    apyBase: nusdcAPY.VaultApy.apy1d * 100,
    apyBase7d: nusdcAPY.VaultApy.apy7d * 100,
    rewardTokens: [
      '0x22F4730e21e40Dc751c08826d93010A64185e53f',
      '0x3CAaE25Ee616f2C8E13C74dA0813402eae3F496b',
    ],
  };

  return [GlpPool, nUSDCPool];
};

module.exports = {
  timetravel: false,
  apy: poolsFunction,
  url: 'https://neutra.finance',
};
