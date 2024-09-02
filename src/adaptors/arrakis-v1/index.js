const axios = require('axios');

const { gql, request } = require('graphql-request');
const sdk = require('@defillama/sdk');

const utils = require('../utils');
const { arrakisABI } = require('./abi');

const CHAINS = {
  ethereum: sdk.graph.modifyEndpoint(
    '2jrpKNFuyHgD6rKf5UUMHkmn1LmkCZG4RsGW4DtqU2i'
  ),
  polygon: sdk.graph.modifyEndpoint(
    '3mgJQXKpkggZUKbt8v5pDy9jvkvKV7EEYGi4rogNmLbZ'
  ),
  optimism: sdk.graph.modifyEndpoint(
    'H7KF8RUHTk5PrtQCZ5iFCqB5Xrp66gq1aJhXbJXkW9xB'
  ),
};

const CHAIN_IDS = {
  ethereum: 1,
  optimism: 10,
  polygon: 137,
};

const vaultsQuery = gql`
  {
    vaults {
      id
      apr {
        averageApr
      }
      snapshots(orderBy: startTimestamp, orderDirection: desc, first: 1) {
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
        await request(CHAINS[chain], vaultsQuery),
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
    await axios.get(
      `https://coins.llama.fi/prices/current/${keys
        .flat()
        .join(',')
        .toLowerCase()}`
    )
  ).data.coins;

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
        project: 'arrakis-v1',
        symbol: `${vault.token0.symbol}-${vault.token1.symbol}`,
        tvlUsd: tvl || 0,
        apyBase: vault.snapshots[0]
          ? Number(vault.snapshots[0].apr)
          : Number(vault.apr.averageApr),
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
