const sdk = require('@defillama/sdk');
const { BigNumber, utils: etherUtils } = require('ethers');
const { request, gql } = require('graphql-request');
const axios = require('axios');

const { autopoolAbi } = require('./abis/Autopool');
const { autopoolETHStrategyAbi } = require('./abis/AutopoolETHStrategy');
const { erc20Abi } = require('./abis/ERC20');

const SETTINGS_BY_SYSTEM = [
  {
    chainId: 1,
    systemName: 'gen3',
    subgraphUrl:
      'https://subgraph.satsuma-prod.com/56ca3b0c9fd0/tokemak/v2-gen3-eth-mainnet/api',
    weth: '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2',
    multicallChainId: 'ethereum',
    pricePrefixChainId: 'ethereum',
    poolsChainId: 'Ethereum',
  },
  {
    chainId: 8453,
    systemName: 'gen3',
    subgraphUrl:
      'https://subgraph.satsuma-prod.com/56ca3b0c9fd0/tokemak/v2-gen3-base-mainnet/api',
    weth: '0x4200000000000000000000000000000000000006',
    multicallChainId: 'base',
    pricePrefixChainId: 'base',
    poolsChainId: 'Base',
  },
];

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

const getGenStratAprsForSystem = async (settings) => {
  const results = {};
  try {
    const { data } = await axios.get(
      `https://genstrat-aprs.tokemaklabs.xyz/api/aprs?chainId=${settings.chainId}&systemName=${settings.systemName}`
    );
    if (data.success) {
      for (const autopool of data.aprs) {
        const aid = autopool.autopoolAddress.toLowerCase();
        results[aid] = {};
        for (const dest of autopool.destinations) {
          const did = dest.address.toLowerCase();
          results[aid][did] = dest.apr;
        }
      }
    }
  } catch (e) {
    logger.error(e);
  }

  return results;
};

const getAutopools = async (settings) => {
  const { autopools } = await request(settings.subgraphUrl, autopoolsQuery, {});
  return autopools;
};

const getBaseAssetPrice = async (settings, baseAsset) => {
  const baseAssetPriceKey = `${settings.pricePrefixChainId}:${baseAsset}`;
  const baseAssetPrice = (
    await axios.get(
      `https://coins.llama.fi/prices/current/${baseAssetPriceKey}`
    )
  ).data.coins[baseAssetPriceKey]?.price;
  return baseAssetPrice;
};

async function getPoolsForSystem(settings) {
  const autopools = await getAutopools(settings);
  const genStratAprs = await getGenStratAprsForSystem(settings);

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
      permitFailure: true,
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
      permitFailure: true,
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
      permitFailure: true,
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
      permitFailure: true,
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
      permitFailure: true,
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

      let cr = 0;
      if (
        autopool.strategy.id == '0x0000000000000000000000000000000000000000' ||
        autopool.strategy.id == '0x000000000000000000000000000000000000dead'
      ) {
        // gen strat
        cr =
          genStratAprs[autopool.id.toLowerCase()]?.[
            autopool.destinationVaults[d].id.toLowerCase()
          ] || 0;
      } else {
        cr =
          summaryStatResult.output &&
          summaryStatResult.output.compositeReturn != null
            ? Number(
                etherUtils.formatUnits(
                  summaryStatResult.output.compositeReturn,
                  18
                )
              )
            : 0;
      }

      compositeReturn += debtValueWeight * cr;
    }

    const autopoolPeriodicFee = BigNumber.from(autopool.periodicFee);
    const autopoolStreamingFee = BigNumber.from(autopool.streamingFee);

    const applicablePeriodicFee = autopoolPeriodicFee;
    const applicableStreamingFee = autopoolStreamingFee;

    // Calculate compositeReturn net of estimated fees
    compositeReturn =
      (compositeReturn / (1 - totalIdle / totalAssets) -
        Number(etherUtils.formatUnits(applicablePeriodicFee, 4))) *
      (1 - Number(etherUtils.formatUnits(applicableStreamingFee, 4)));

    autopoolCRs[autopool.id] = compositeReturn;

    ix += dl;
  }

  const pools = [];
  for (const pool of autopools) {
    const baseAssetPrice = await getBaseAssetPrice(settings, pool.baseAsset.id);
    pools.push({
      pool: pool.id,
      chain: settings.poolsChainId,
      project: 'tokemak',
      symbol: pool.baseAsset.symbol,
      tvlUsd:
        Number(etherUtils.formatUnits(pool.nav, pool.baseAsset.decimals)) *
        baseAssetPrice,
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
          ? Number(etherUtils.formatUnits(pool.rewarder.currentApy, 18))
          : 0) * 100,
      url: 'https://app.tokemak.xyz/autopool?id=' + pool.id,
      poolMeta: pool.symbol,
    });
  }

  return pools;
}

async function main() {
  const pools = [];
  for (const system of SETTINGS_BY_SYSTEM) {
    pools.push(...(await getPoolsForSystem(system)));
  }
  return pools;
}

module.exports = {
  timeTravel: false,
  apy: main,
  url: 'https://app.tokemak.xyz',
};
