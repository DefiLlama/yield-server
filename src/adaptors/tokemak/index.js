const sdk = require('@defillama/sdk');
const { BigNumber, utils: etherUtils } = require('ethers');
const { request, gql } = require('graphql-request');
const axios = require('axios');

const { autopoolAbi } = require('./abis/Autopool');
const { autopoolETHStrategyAbi } = require('./abis/AutopoolETHStrategy');
const { erc20Abi } = require('./abis/ERC20');

const WETH = '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2';
const V2_GEN3_ETH_MAINNET_SUBGRAPH_URL =
  'https://subgraph.satsuma-prod.com/56ca3b0c9fd0/tokemak/v2-gen3-eth-mainnet/api';

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
      day7MAApy
      day30MAApy
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

const getAutopools = async () => {
  const { autopools } = await request(
    V2_GEN3_ETH_MAINNET_SUBGRAPH_URL,
    autopoolsQuery,
    {}
  );
  return autopools;
};

const getWethPrice = async () => {
  const wethPriceKey = `ethereum:${WETH}`;
  const wethPrice = (
    await axios.get(`https://coins.llama.fi/prices/current/${wethPriceKey}`)
  ).data.coins[wethPriceKey]?.price;
  return wethPrice;
};

async function main() {
  const autopools = await getAutopools();

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
      chain: 'ethereum',
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
      chain: 'ethereum',
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
      chain: 'ethereum',
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
      chain: 'ethereum',
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
      chain: 'ethereum',
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

    // Calculate compositeReturn net of estimated fees
    compositeReturn =
      (compositeReturn / (1 - totalIdle / totalAssets) -
        Number(etherUtils.formatUnits(autopool.periodicFee, 4))) *
      (1 - Number(etherUtils.formatUnits(autopool.streamingFee, 4)));

    autopoolCRs[autopool.id] = compositeReturn;

    ix += dl;
  }

  const wethPrice = await getWethPrice();

  const pools = autopools.map((pool, i) => ({
    pool: pool.id,
    chain: 'Ethereum',
    project: 'tokemak',
    symbol: pool.baseAsset.symbol,
    tvlUsd:
      Number(etherUtils.formatUnits(pool.nav, pool.baseAsset.decimals)) *
      wethPrice,
    rewardTokens: [pool.rewarder.rewardToken.id],
    underlyingTokens: [pool.baseAsset.id],
    apyBase:
      // Use the 30 day MA when we have it, falling back to the 7 when we don't, and finally to the max compositeReturn
      ((pool.day30MAApy
        ? Number(
            etherUtils.formatUnits(pool.day30MAApy, pool.baseAsset.decimals)
          )
        : pool.day7MAApy
        ? Number(
            etherUtils.formatUnits(pool.day7MAApy, pool.baseAsset.decimals)
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

module.exports = {
  timeTravel: false,
  apy: main,
  url: 'https://app.tokemak.xyz',
};
