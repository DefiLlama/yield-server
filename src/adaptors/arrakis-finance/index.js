const superagent = require('superagent');

const { gql, request } = require('graphql-request');
const { get } = require('lodash');
const sdk = require('@defillama/sdk');

const utils = require('../utils');
const { arrakisABI } = require('./abi');

const CHAINS = {
  ethereum: 'mainnet',
  polygon: 'polygon',
  optimism: 'optimism',
};

const CHAINS_CG = {
  ethereum: 'ethereum',
  polygon: 'polygon-pos',
  optimism: 'optimistic-ethereum',
};

const CHAIN_IDS = {
  ethereum: 1,
  optimism: 10,
  polygon: 137,
};

const getUrl = (chain) =>
  `https://api.thegraph.com/subgraphs/name/arrakisfinance/vault-v1-${chain}`;

const vaultsQuery = gql`
  {
    vaults {
      id
      snapshots(orderBy: startTimestamp, orderDirection: desc, first:1) {
        apr
      }
      token0 {
        symbol
        address
        decimals
      }
      token1 {
        symbol
        address
        decimals
      }
      uniswapPool
    }
  }
`;

const pairsToObj = (pairs) =>
  pairs.reduce((acc, [el1, el2]) => ({ ...acc, [el1]: el2 }), {});

const getApy = async () => {
  const vaultData = pairsToObj(
    await Promise.all(
      Object.keys(CHAINS).map(async (chain) => [
        chain,
        await request(getUrl(CHAINS[chain]), vaultsQuery),
      ])
    )
  );

  const underlyingBalances = pairsToObj(
    await Promise.all(
      Object.keys(CHAINS).map(async (chain) =>
        (
          await sdk.api.abi.multiCall({
            abi: arrakisABI.getUnderlyingBalances,
            calls: vaultData[chain].vaults.map((v) => ({
              target: v.id,
            })),
            chain: chain,
          })
        ).output.map(({ output, input }) => [input.target, output])
      )
    ).then((val) => val.flat())
  );
  const tokens = Object.entries(vaultData).reduce(
    (acc, [chain, { vaults }]) => ({
      ...acc,
      [chain]: [
        ...new Set(
          vaults
            .map((vault) => [vault.token0.address, vault.token1.address])
            .flat()
        ),
      ],
    }),
    {}
  );

  const keys = [];
  for (const key of Object.keys(tokens)) {
    keys.push(tokens[key].map((t) => `${key}:${t}`));
  }
  const prices = (
    await superagent.post('https://coins.llama.fi/prices').send({
      coins: keys.flat(),
    })
  ).body.coins;

  const pools = Object.keys(CHAINS).map((chain) => {
    const { vaults: chainVaults } = vaultData[chain];
    const chainAprs = chainVaults.map((vault) => {
      const { amount0Current, amount1Current } = underlyingBalances[vault.id];
      const token0Supply = Number(amount0Current) / 10 ** vault.token0.decimals;
      const token1Supply = Number(amount1Current) / 10 ** vault.token1.decimals;
      const tvl =
        token0Supply * prices[`${chain}:${vault.token0.address}`]?.price +
        token1Supply * prices[`${chain}:${vault.token1.address}`]?.price;

      return {
        pool: vault.id,
        chain: utils.formatChain(chain),
        project: 'arrakis-finance',
        symbol: `${vault.token0.symbol}-${vault.token1.symbol}`,
        tvlUsd: tvl || 0,
        apy: Number(vault.snapshots[0].apr),
        url: `https://beta.arrakis.finance/vaults/${CHAIN_IDS[chain]}/${vault.id}`,
        underlyingTokens: [vault.token0.address, vault.token1.address],
      };
    });
    return chainAprs;
  });
  return pools.flat();
};

module.exports = {
  timetravel: false,
  apy: getApy,
};
