const sdk = require('@defillama/sdk');
const { BigNumber, utils: etherUtils } = require('ethers');
const { request, gql } = require('graphql-request');
const axios = require('axios');

const { autopoolAbi } = require('./abis/Autopool');
const { autopoolETHStrategyAbi } = require('./abis/AutopoolETHStrategy');

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

  // Get the summary stats for all autopools and destinations
  const results = await sdk.api.abi.multiCall({
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
  });

  // Determine the max compositeReturn for each Autopool
  let ix = 0;
  const autopoolCRs = {};
  for (let a = 0; a < autopools.length; a++) {
    const autopool = autopools[a];
    const dl = autopool.destinationVaults.length;
    let maxCompositeReturn = 0;
    for (let d = 0; d < dl; d++) {
      const result = results.output[ix + d];

      let cr = Number(
        etherUtils.formatUnits(result.output.compositeReturn, 18)
      );

      // Calculate compositeReturn net of estimated fees
      cr =
        (cr - Number(etherUtils.formatUnits(autopool.periodicFee, 4))) *
        (1 - Number(etherUtils.formatUnits(autopool.streamingFee, 4)));

      if (cr > maxCompositeReturn) {
        maxCompositeReturn = cr;
      }
    }
    autopoolCRs[autopool.id] = maxCompositeReturn;

    ix += dl;
  }

  const wethPrice = await getWethPrice();

  const pools = autopools.map((pool, i) => ({
    pool: pool.id,
    chain: 'Ethereum',
    project: 'tokemak',
    symbol: pool.symbol,
    tvlUsd:
      Number(etherUtils.formatUnits(pool.nav, pool.baseAsset.decimals)) *
      wethPrice,
    rewardTokens: [pool.rewarder.rewardToken.id],
    underlyingTokens: [pool.baseAsset.id],
    apyBase:
      // Use the 30 day MA when we have it, falling back to the 7 when we don't, and finally to the max compositeReturn
      (pool.day30MAApy
        ? Number(
            etherUtils.formatUnits(pool.day30MAApy, pool.baseAsset.decimals)
          )
        : pool.day7MAApy
        ? Number(
            etherUtils.formatUnits(pool.day7MAApy, pool.baseAsset.decimals)
          )
        : autopoolCRs[pool.id]) || 0,
    apyReward: pool.rewarder.currentApy
      ? Number(
          etherUtils.formatUnits(
            pool.rewarder.currentApy,
            pool.baseAsset.decimals
          )
        )
      : 0,
    url: 'https://app.tokemak.xyz/autopool?id=' + pool.id,
  }));

  return pools;
}

module.exports = {
  timeTravel: false,
  apy: main,
  url: 'https://app.tokemak.xyz',
};
