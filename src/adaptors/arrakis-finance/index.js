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

const getUrl = (chain) =>
  `https://api.thegraph.com/subgraphs/name/arrakisfinance/vault-v1-${chain}`;

const vaultsQuery = gql`
  {
    vaults {
      id
      apr {
        averageApr
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

const getCGPrices = async (tokens) => {
  const prices = pairsToObj(
    await Promise.all(
      Object.entries(tokens).map(async ([chain, tokens]) => [
        chain,
        await utils.getCGpriceData(tokens.join(','), false, CHAINS_CG[chain]),
      ])
    )
  );

  return prices;
};

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

  const prices = await getCGPrices(tokens);

  const pools = Object.keys(CHAINS).map((chain) => {
    const { vaults: chainVaults } = vaultData[chain];
    const chainAprs = chainVaults.map((vault) => {
      const { amount0Current, amount1Current } = underlyingBalances[vault.id];
      const token0Supply = Number(amount0Current) / 10 ** vault.token0.decimals;
      const token1Supply = Number(amount1Current) / 10 ** vault.token1.decimals;
      const tvl =
        token0Supply * get(prices[chain][vault.token0.address], 'usd', 0) +
        token1Supply * get(prices[chain][vault.token1.address], 'usd', 0);

      return {
        pool: vault.id,
        chain: utils.formatChain(chain),
        project: 'arrakis-finance',
        symbol: `${vault.token0.symbol}-${vault.token1.symbol}`,
        tvlUsd: tvl || 0,
        apy: Number(vault.apr.averageApr),
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
