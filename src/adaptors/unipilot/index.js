const sdk = require('@defillama/sdk');
const superagent = require('superagent');
const { gql, request } = require('graphql-request');
const axios = require('axios');
const utils = require('../utils');

const EXCHANGES_CHAINS = {
  quickswap: {
    polygon: 'polygon',
    polygon_zkevm: 'polygon_zkevm',
    dogechain: 'dogechain',
  },
  uniswapv3: {
    ethereum: 'ethereum',
    polygon: 'polygon',
    arbitrum: 'arbitrum',
    bsc: 'bsc',
  },
};

const GRAPH_URLS = {
  uniswapv3: {
    ethereum:
      'https://api.thegraph.com/subgraphs/name/unipilotvoirstudio/unipilot-v2-stats',
    polygon: sdk.graph.modifyEndpoint('5wUArtUmdKBipfXaD9Rwg3ZDWUTPRBTBJSDHvyhc7AHb'),
    arbitrum:
      'https://api.thegraph.com/subgraphs/name/hamzabhatti125/unipilot-stats-arbitrum',
    bsc: 'https://api.thegraph.com/subgraphs/name/hamzabhatti125/unipilot-stats-bnb',
  },
  quickswap: {
    polygon: sdk.graph.modifyEndpoint('GXc2d1wMCbyKq2F2qRo8zcCad6tXsmXubEA5F8jGKBTG'),
    polygon_zkevm:
      'https://api.studio.thegraph.com/query/19956/unipilot-stats-polygonzkevm/v0.0.1',
    dogechain:
      'https://apis.unipilot.io:5000/subgraphs/name/hamzabhatti125/stats-dogechain',
  },
};

const vaultsQueryEthereum = gql`
  {
    vaults {
      id
      token0 {
        id
        symbol
        decimals
      }
      token1 {
        id
        symbol
        decimals
      }
      totalLockedToken0
      totalLockedToken1
    }
  }
`;

const vaultsQuery = gql`
  {
    vaults {
      id
      strategyId
      token0 {
        id
        symbol
        decimals
      }
      token1 {
        id
        symbol
        decimals
      }
      totalLockedToken0
      totalLockedToken1
    }
  }
`;

const pairsToObj = (pairs) =>
  pairs.reduce((acc, [el1, el2]) => ({ ...acc, [el1]: el2 }), {});

const APR_SERVER_ENDPOINT = (vaultAddresses, chainId, exchange) => {
  if (exchange === 'uniswapv3') {
    return `https://apis.unipilot.io/api/unipilot/aprs?vaultAddresses=${vaultAddresses.join(
      ','
    )}&chaiId=${chainId}`;
  } else if (exchange === 'quickswap') {
    return `https://apis.unipilot.io:447/api/unipilot/aprs?vaultAddresses=${vaultAddresses.join(
      ','
    )}&chaiId=${chainId}`;
  }
};

const CHAIN_IDS = {
  ethereum: 1,
  polygon: 137,
  polygon_zkevm: 1101,
  arbitrum: 42161,
  bsc: 56,
  dogechain: 2000,
};

const resultArray = [];

const getStrategties = (strategyId) => {
  if (strategyId === '1') return 'Wide';
  else if (strategyId === '2') return 'Balanced';
  else if (strategyId === '3') return 'Narrow';
  else return '';
};

const getApy = async () => {
  for (const [exchange, chains] of Object.entries(EXCHANGES_CHAINS)) {
    try {
      const vaultData = pairsToObj(
        await Promise.all(
          Object.values(chains).map(async (chain) => [
            chain,
            await request(
              GRAPH_URLS[exchange][chains[chain]],
              chain === 'ethereum' ? vaultsQueryEthereum : vaultsQuery
            ),
          ])
        )
      );

      const aprs = pairsToObj(
        await Promise.all(
          Object.values(chains).map(async (chain) => {
            //convert array of string to single string with comma separated
            const vaultAddresses = vaultData[chain].vaults.map(
              (vault) => vault.id
            );
            const res = await axios.get(
              APR_SERVER_ENDPOINT(vaultAddresses, CHAIN_IDS[chain], exchange)
            );
            return [chain, res.data.doc];
          })
        )
      );

      // get token object where key is chain and value is array of token addresses
      const tokens = Object.entries(vaultData).reduce(
        (acc, [chain, { vaults }]) => ({
          ...acc,
          [chain]: [
            ...new Set(
              vaults.map((vault) => [vault.token0.id, vault.token1.id]).flat()
            ),
          ],
        }),
        {}
      );

      let keys = [];
      for (const key of Object.keys(tokens)) {
        keys.push(tokens[key].map((t) => `${key}:${t}`));
      }
      keys = [...new Set(keys.flat())];

      const prices = (
        await superagent.get(
          `https://coins.llama.fi/prices/current/${keys
            .flat()
            .join(',')
            .toLowerCase()}`
        )
      ).body.coins;

      const pools = Object.entries(vaultData).map(([chain, { vaults }]) => {
        const vaultsAprs = aprs[chain];
        const modifiedVaults = vaults.map((vault) => {
          const tvl0 =
            Number(vault.totalLockedToken0) /
            10 ** Number(vault.token0.decimals);
          const tvl1 =
            Number(vault.totalLockedToken1) /
            10 ** Number(vault.token1.decimals);
          const tvlUSD =
            tvl0 * prices[`${chain}:${vault.token0.id}`]?.price +
            tvl1 * prices[`${chain}:${vault.token1.id}`]?.price;

          return {
            pool: vault.id,
            chain: utils.formatChain(chain),
            project: 'unipilot',
            symbol: `${vault.token0.symbol}-${vault.token1.symbol} ${
              vault.strategyId ? getStrategties(vault.strategyId) : ''
            }`,
            tvlUsd: tvlUSD || 0,
            url:
              exchange === 'quickswap'
                ? `https://quickswap.unipilot.io/add?vault=${vault.id}&chainId=${CHAIN_IDS[chain]}`
                : `https://app.unipilot.io/add?vault=${vault.id}&chainId=${CHAIN_IDS[chain]}`,
            underlyingTokens: [vault.token0.id, vault.token1.id],
            apyBase: Number(vaultsAprs[vault.id]?.avg24Hrs.total) ?? 0,
            apyBase7d: Number(vaultsAprs[vault.id]?.avgAprWeekly.total) ?? 0,
          };
        });
        return modifiedVaults;
      });
      resultArray.push(...pools.flat());
    } catch (error) {
      console.log(error);
    }
  }
  return resultArray;
};

module.exports = {
  timetravel: false,
  apy: getApy,
};
