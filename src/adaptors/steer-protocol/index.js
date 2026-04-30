const { request } = require('graphql-request');
const sdk = require('@defillama/sdk');
const utils = require('../utils');
const { addMerklRewardApy } = require('../merkl/merkl-additional-reward');
const axios = require('axios');

// add chain deployments and subgraph endpoints here
const supportedChains = [
  {
    name: 'Polygon',
    chainId: 137,
    subgraphEndpoint: sdk.graph.modifyEndpoint(
      'uQxLz6EarmJcr2ymRRmTnrRPi8cCqas4XcPQb71HBvw'
    ),
  },
  {
    name: 'Arbitrum',
    chainId: 42161,
    subgraphEndpoint: sdk.graph.modifyEndpoint(
      'HVC4Br5yprs3iK6wF8YVJXy4QZWBNXTCFp8LPe3UpcD4'
    ),
  },
  {
    name: 'Optimism',
    chainId: 10,
    subgraphEndpoint: sdk.graph.modifyEndpoint(
      'GgW1EwNARL3dyo3acQ3VhraQQ66MHT7QnYuGcQc5geDG'
    ),
  },
  {
    name: 'Ethereum',
    chainId: 1,
    subgraphEndpoint:
      'https://api.subgraph.ormilabs.com/api/public/803c8c8c-be12-4188-8523-b9853e23051d/subgraphs/steer-protocol-mainnet/prod/gn',
  },
];

// Fetch active vaults and associated data @todo limited to 1000 per chain
const query = `
{
    vaults(first: 1000, where: {totalLPTokensIssued_not: "0"}) {
      weeklyFeeAPR
      beaconName
      feeTier
      id
      pool
      token0
      token0Symbol
      token0Decimals
      token1
      token1Symbol
      token1Decimals
      totalLPTokensIssued
      totalAmount1
      totalAmount0
      strategyToken {
        id
      }
    }
  }`;

const getPools = async () => {
  const pools = [];
  for (const chainInfo of supportedChains) {
    try {
      const data = await request(chainInfo.subgraphEndpoint, query);
      // get tokens
      const tokenList = new Set();
      data.vaults.forEach((vaultInfo) => {
        tokenList.add((chainInfo.name + ':' + vaultInfo.token0).toLowerCase());
        tokenList.add((chainInfo.name + ':' + vaultInfo.token1).toLowerCase());
      });

      // get prices
      const tokenPrices = (
        await axios.get(
          `https://coins.llama.fi/prices/current/${[...tokenList]}`
        )
      ).data.coins;

      const chainPools = data.vaults.map((vault) => {
        // calculate tvl
        const totalUSD0 =
          (Number(vault.totalAmount0) *
            tokenPrices[`${chainInfo.name.toLowerCase()}:${vault.token0}`]
              ?.price) /
          10 ** Number(vault.token0Decimals);
        const totalUSD1 =
          (Number(vault.totalAmount1) *
            tokenPrices[`${chainInfo.name.toLowerCase()}:${vault.token1}`]
              ?.price) /
          10 ** Number(vault.token1Decimals);
        const poolTvl = totalUSD0 + totalUSD1;
        return {
          pool: (vault.id + '-' + chainInfo.name).toLowerCase(),
          chain: chainInfo.name, // chain where the pool is (needs to match the `name` field in here https://api.llama.fi/chains)
          project: 'steer-protocol', // protocol (using the slug again)
          symbol: vault.token0Symbol + '-' + vault.token1Symbol, // symbol of the tokens in pool, can be a single symbol if pool is single-sided or multiple symbols (eg: USDT-ETH) if it's an LP
          tvlUsd: poolTvl, // number representing current USD TVL in pool
          apyBase: parseFloat(vault.weeklyFeeAPR), // APY from pool fees/supplying in %
          underlyingTokens: [vault.token0, vault.token1], // Array of underlying token addresses from a pool, eg here USDT address on ethereum
          poolMeta: vault.beaconName.replace('MultiPosition', ''),
          url:
            'https://app.steer.finance/vault/' +
            chainInfo.chainId +
            '/' +
            vault.id,
        };
      });
      pools.push(...chainPools);
    } catch (err) {
      console.log(err.message);
    }
  }
  const filtered = pools.filter((i) => utils.keepFinite(i));
  return addMerklRewardApy(filtered, 'steer', (p) => p.pool.split('-')[0]);
};

module.exports = {
  timetravel: false,
  apy: getPools,
};
