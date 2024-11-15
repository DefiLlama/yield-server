const sdk = require('@defillama/sdk');
const { BigNumber, utils: etherUtils } = require('ethers');
const { request, gql } = require('graphql-request');
const axios = require('axios');

const { autopoolAbi } = require('./abis/Autopool');
const { autopoolETHStrategyAbi } = require('./abis/AutopoolETHStrategy');
const { erc20Abi } = require('./abis/ERC20');

const SETTINGS_BY_CHAIN = {
  1: {
    subgraphUrl:
      'https://subgraph.satsuma-prod.com/56ca3b0c9fd0/tokemak/v2-gen3-eth-mainnet/api',
    weth: '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2',
    multicallChainId: 'ethereum',
    pricePrefixChainId: 'ethereum',
    poolsChainId: 'Ethereum',
  },
  8453: {
    subgraphUrl:
      'https://subgraph.satsuma-prod.com/56ca3b0c9fd0/tokemak/v2-gen3-base-mainnet/api',
    weth: '0x4200000000000000000000000000000000000006',
    multicallChainId: 'base',
    pricePrefixChainId: 'base',
    poolsChainId: 'Base',
  },
};

const BN_ZERO = BigNumber.from('0');

const autopoolsQuery = gql`
  query AutopoolsQuery {
    autopools {
      name
      id
      nav
      symbol
      nav
      baseAsset {
        id
        decimals
        symbol
      }
      currentApy
      periodicFee
      streamingFee
      rewarder {
        currentApy
        rewardToken {
          id
        }
      }
      destinationVaults {
        id
        underlyer {
          decimals
          name
        }
      }
      strategy {
        id
      }
    }
  }
`;

const getAutopools = async (settings) => {
  const { autopools } = await request(settings.subgraphUrl, autopoolsQuery, {});
  return autopools;
};

const getWethPrice = async (settings) => {
  const wethPriceKey = `${settings.pricePrefixChainId}:${settings.weth}`;
  const wethPrice = (
    await axios.get(`https://coins.llama.fi/prices/current/${wethPriceKey}`)
  ).data.coins[wethPriceKey]?.price;
  return wethPrice;
};

async function getPoolsForChain(chainId) {
  const settings = SETTINGS_BY_CHAIN[chainId];

  const autopools = await getAutopools(settings);

  const multicalls = [];

  // Get the summary stats for all autopools and destinations
  multicalls.push(
    sdk.api.abi.multiCall({
      abi: autopoolETHStrategyAbi.find(
        ({ name }) => name === 'getDestinationSummaryStats'
      ),
      calls: autopools.flatMap((autopool) => {
        return autopool.destinationVaults.map((destVault) => {
          return {
            target: autopool.strategy.id,
            params: [
              destVault.id,
              1,
              BigNumber.from(10).pow(destVault.underlyer.decimals).toString(),
            ],
          };
        });
      }),
      chain: settings.multicallChainId,
      permitFailure: false,
    })
  );

  // Get the destination info for all Autopools
  multicalls.push(
    sdk.api.abi.multiCall({
      abi: autopoolAbi.find(({ name }) => name === 'getDestinationInfo'),
      calls: autopools.flatMap((autopool) => {
        return autopool.destinationVaults.map((destVault) => {
          return {
            target: autopool.id,
            params: [destVault.id],
          };
        });
      }),
      chain: settings.multicallChainId,
      permitFailure: false,
    })
  );

  // Get the current balance of destination tokens held by the Autopools
  multicalls.push(
    sdk.api.abi.multiCall({
      abi: autopoolAbi.find(({ name }) => name === 'balanceOf'),
      calls: autopools.flatMap((autopool) => {
        return autopool.destinationVaults.map((destVault) => {
          return {
            target: destVault.id,
            params: [autopool.id],
          };
        });
      }),
      chain: settings.multicallChainId,
      permitFailure: false,
    })
  );

  // Get the totalAssets of all Autopools
  multicalls.push(
    sdk.api.abi.multiCall({
      abi: autopoolAbi.find(
        ({ name, inputs }) => name === 'totalAssets' && inputs.length == 0
      ),
      calls: autopools.map((autopool) => {
        return {
          target: autopool.id,
          params: [],
        };
      }),
      chain: settings.multicallChainId,
      permitFailure: false,
    })
  );

  // Get the totalIdle of all Autopools
  multicalls.push(
    sdk.api.abi.multiCall({
      abi: autopoolAbi.find(({ name, inputs }) => name === 'getAssetBreakdown'),
      calls: autopools.map((autopool) => {
        return {
          target: autopool.id,
          params: [],
        };
      }),
      chain: settings.multicallChainId,
      permitFailure: false,
    })
  );

  const multicallResults = await Promise.all(multicalls);

  const summaryStatResults = multicallResults[0];
  const destinationInfoResults = multicallResults[1];
  const balanceOfResults = multicallResults[2];
  const totalAssetResults = multicallResults[3];
  const getAssetBreakdownResults = multicallResults[4];

  // Determine the compositeReturn for each Autopool weighted by
  // the debt value held from that Destination
  let ix = 0;
  const autopoolCRs = {};
  for (let a = 0; a < autopools.length; a++) {
    const autopool = autopools[a];
    const totalAssets = Number(
      etherUtils.formatUnits(totalAssetResults.output[a].output, 18)
    );
    const totalIdle = Number(
      etherUtils.formatUnits(
        getAssetBreakdownResults.output[a].output.totalIdle
      )
    );
    const dl = autopool.destinationVaults.length;
    let compositeReturn = 0;
    for (let d = 0; d < dl; d++) {
      const summaryStatResult = summaryStatResults.output[ix + d];
      const destinationInfoResult = destinationInfoResults.output[ix + d];
      const balanceOfResult = balanceOfResults.output[ix + d];

      const ownedShares = BigNumber.from(
        destinationInfoResult.output.ownedShares
      );
      const cachedMinDebtValue = BigNumber.from(
        destinationInfoResult.output.cachedMinDebtValue
      );
      const cachedMaxDebtValue = BigNumber.from(
        destinationInfoResult.output.cachedMaxDebtValue
      );
      const vaultBalOfDest = BigNumber.from(balanceOfResult.output);

      const debtValueHeldByVaultEth = Number(
        etherUtils.formatUnits(
          (ownedShares.gt(BigNumber.from(0))
            ? cachedMinDebtValue
                .mul(vaultBalOfDest)
                .div(ownedShares)
                .add(cachedMaxDebtValue.mul(vaultBalOfDest).div(ownedShares))
            : BigNumber.from(0)
          ).div(BigNumber.from(2)),
          18
        )
      );

      const debtValueWeight = debtValueHeldByVaultEth / totalAssets;

      const cr = Number(
        etherUtils.formatUnits(summaryStatResult.output.compositeReturn, 18)
      );

      compositeReturn += debtValueWeight * cr;
    }

    const autopoolPeriodicFee = BigNumber.from(autopool.periodicFee);
    const autopoolStreamingFee = BigNumber.from(autopool.streamingFee);

    // Fees may temporarily go to zero but we want the crm to display as though
    // they are still applied so we don't see sharp temporary increases
    const applicablePeriodicFee = autopoolPeriodicFee.eq(BN_ZERO)
      ? BigNumber.from(50)
      : autopoolPeriodicFee;

    const applicableStreamingFee = autopoolStreamingFee.eq(BN_ZERO)
      ? BigNumber.from(1500)
      : autopoolStreamingFee;

    // Calculate compositeReturn net of estimated fees
    compositeReturn =
      (compositeReturn / (1 - totalIdle / totalAssets) -
        Number(etherUtils.formatUnits(applicablePeriodicFee, 4))) *
      (1 - Number(etherUtils.formatUnits(applicableStreamingFee, 4)));

    autopoolCRs[autopool.id] = compositeReturn;

    ix += dl;
  }

  const wethPrice = await getWethPrice(settings);

  const pools = autopools.map((pool, i) => ({
    pool: pool.id,
    chain: settings.poolsChainId,
    project: 'tokemak',
    symbol: pool.baseAsset.symbol,
    tvlUsd:
      Number(etherUtils.formatUnits(pool.nav, pool.baseAsset.decimals)) *
      wethPrice,
    rewardTokens: [pool.rewarder.rewardToken.id],
    underlyingTokens: [pool.baseAsset.id],
    apyBase:
      // If we have a currentApy populated, use it. Otherwise, use the weighted CRM.
      ((pool.currentApy
        ? Number(
            etherUtils.formatUnits(pool.currentApy, pool.baseAsset.decimals)
          )
        : autopoolCRs[pool.id]) || 0) * 100,
    apyReward:
      (pool.rewarder.currentApy
        ? Number(
            etherUtils.formatUnits(
              pool.rewarder.currentApy,
              pool.baseAsset.decimals
            )
          )
        : 0) * 100,
    url: 'https://app.tokemak.xyz/autopool?id=' + pool.id,
    poolMeta: pool.symbol,
  }));

  return pools;
}

async function main() {
  const chainIds = Object.keys(SETTINGS_BY_CHAIN);
  const pools = [];
  for (let i = 0; i < chainIds.length; i++) {
    pools.push(...(await getPoolsForChain(chainIds[i])));
  }
  return pools;
}

module.exports = {
  timeTravel: false,
  apy: main,
  url: 'https://app.tokemak.xyz',
};
