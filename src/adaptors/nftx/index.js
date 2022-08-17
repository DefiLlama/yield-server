const utils = require('../utils');
const { request, gql } = require('graphql-request');

const NFTX_VAULTS_SUBGRAPH =
  'https://graph-proxy.nftx.xyz/gateway/api/f0149ced5dcb5d0f0fc2b6270039fc57/subgraphs/id/4gZf3atMXjYDh4g48Zr83NFX3rkvZED86VqMNhgEXgLc';
const NFTX_VAULT_APR_API = 'https://data.nftx.xyz/vaultdata';

const query = gql`
  {
    vaults(
      first: 1000
      where: { isFinalized: true, totalHoldings_gt: 2, shutdownDate: 0 }
    ) {
      id
      vaultId
      token {
        symbol
      }
      totalHoldings
      inventoryStakingPool {
        id
      }
      lpStakingPool {
        id
        stakingToken {
          id
        }
      }
    }
  }
`;

const poolsFunction = async () => {
  const vaultsData = await request(NFTX_VAULTS_SUBGRAPH, query);

  const aprAndPriceData = await utils.getData(NFTX_VAULT_APR_API);

  const data = aprAndPriceData.map((item) => {
    // filter out illiquid vault
    if (item.estimatedPriceImpact > 20) {
      return null;
    }

    const vault = vaultsData.vaults.find(
      (v) => Number(v.vaultId) === item.vaultId
    );

    if (vault) {
      const tvlUsd =
        Number(vault.totalHoldings) * item.spotPriceEth * item.ethPriceUsd;

      const apr = (item.inventoryApr + item.liquidityApr) * 100;
      // we calculate monthly
      const apy = utils.aprToApy(apr, 12);

      // filter out remaining fluff
      if (!apy || apy === Infinity) {
        return null;
      }

      return {
        pool: vault.id,
        chain: utils.formatChain('ethereum'),
        project: 'nftx',
        symbol: vault.token.symbol,
        apy,
        tvlUsd,
        rewardTokens: [vault.id],
        underlyingTokens: [vault.id],
      };
    }

    return null;
  });

  return data.filter(Boolean);
};

module.exports = {
  timetravel: false,
  apy: poolsFunction,
  url: 'https://yield.nftx.io/',
};
