const sdk = require('@defillama/sdk');
const utils = require('../utils');
const { request, gql } = require('graphql-request');
const uniswapV2PairAbi = require('./abis/UniswapV2Pair.json');
const erc20Abi = require('./abis/ERC20.json');

const WETH = '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2';
const NFTX_LP_STAKING = '0x688c3E4658B5367da06fd629E41879beaB538E37';
const NFTX_VAULTS_SUBGRAPH =
  'https://graph-proxy.nftx.xyz/gateway/api/f0149ced5dcb5d0f0fc2b6270039fc57/subgraphs/id/4gZf3atMXjYDh4g48Zr83NFX3rkvZED86VqMNhgEXgLc';
const NFTX_VAULT_APR_API = 'https://data.nftx.xyz/vaultdata';

const query = gql`
  {
    vaults(
      first: 1000
      where: { isFinalized: true, totalHoldings_gt: 10, shutdownDate: 0 }
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

const calculatedStakedLiquidityValue = (reserves, token0, vaultId) => {
  // ensure order is TOKEN-WETH
  const tokenWethReserves =
    token0.toLowerCase() === WETH ? reserves.slice().reverse() : reserves;

  return tokenWethReserves[1] * 2;
};

const poolsFunction = async () => {
  const vaultsData = await request(NFTX_VAULTS_SUBGRAPH, query);

  const aprAndPriceData = await utils.getData(NFTX_VAULT_APR_API);

  const liquidVaults = aprAndPriceData
    .map((data) => {
      // filter out illiquid vaults
      if (data.estimatedPriceImpact > 20 || !data.spotPriceEth) {
        return false;
      }

      const vault = vaultsData.vaults.find(
        (v) => Number(v.vaultId) === data.vaultId
      );

      // make sure we have staking pools
      if (vault && vault.inventoryStakingPool && vault.lpStakingPool) {
        return {
          vault,
          data,
        };
      }

      return false;
    })
    .filter(Boolean);

  // how much liquidity is staked?
  const [reservesRes, token0Res] = await Promise.all(
    ['getReserves', 'token0'].map((method) =>
      sdk.api.abi.multiCall({
        abi: uniswapV2PairAbi.filter(({ name }) => name === method)[0],
        calls: liquidVaults.map(({ vault }) => ({
          target: vault.lpStakingPool.stakingToken.id,
          params: null,
        })),
        chain: 'ethereum',
        requery: true,
      })
    )
  );

  const reserves = reservesRes.output.map((res) => [
    Number(res.output[0]) / 1e18,
    Number(res.output[1]) / 1e18,
  ]);
  const token0 = token0Res.output.map((res) => res.output);

  // how much inventory is staked?
  const [inventoryBalancesRes] = await Promise.all(
    ['balanceOf'].map((method) =>
      sdk.api.abi.multiCall({
        abi: erc20Abi.filter(({ name }) => name === method)[0],
        calls: liquidVaults.map(({ vault }) => ({
          target: vault.id,
          params: vault.inventoryStakingPool.id,
        })),
        chain: 'ethereum',
        requery: true,
      })
    )
  );

  const inventoryBalances = inventoryBalancesRes.output.map(
    (res) => Number(res.output) / 1e18
  );

  const poolsData = liquidVaults.map(({ vault, data }, i) => {
    const inventoryTvl =
      inventoryBalances[i] * data.spotPriceEth * data.ethPriceUsd;

    const liquidityEthTvl = calculatedStakedLiquidityValue(
      reserves[i],
      token0[i],
      vault.vaultId
    );

    return [
      // liquidity
      {
        pool: vault.lpStakingPool.id,
        chain: utils.formatChain('ethereum'),
        project: 'nftx',
        symbol: `${vault.token.symbol}-WETH`,
        apy: data.liquidityApr * 100,
        tvlUsd: liquidityEthTvl * data.ethPriceUsd,
        rewardTokens: [vault.id],
        underlyingTokens: [vault.id, WETH],
      },
      // inventory
      {
        pool: vault.inventoryStakingPool.id,
        chain: utils.formatChain('ethereum'),
        project: 'nftx',
        symbol: vault.token.symbol,
        apy: data.inventoryApr * 100,
        tvlUsd: inventoryTvl,
        rewardTokens: [vault.id],
        underlyingTokens: [vault.id],
      },
    ];
  });

  return poolsData.flat();
};

module.exports = {
  timetravel: false,
  apy: poolsFunction,
  url: 'https://yield.nftx.io/',
};
