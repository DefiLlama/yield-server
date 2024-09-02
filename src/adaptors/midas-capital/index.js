const superagent = require('superagent');
const sdk = require('@defillama/sdk');
const { ethers } = require('ethers');

const utils = require('../utils');
const poolDirectoryAbi = require('../midas-capital/abiPoolDirectory');
const poolLensAbi = require('../midas-capital/abiPoolLens');
const flywheelLensRouterAbiV1 = require('../midas-capital/abiFlywheelLensRouter');
const flywheelLensRouterAbiV2 = require('../midas-capital/abiFlywheelLensRouterV2');

const CHAINS = {
  arbitrum: 'arbitrum',
  bsc: 'bsc',
  polygon: 'polygon',
  fantom: 'fantom',
};
const CHAIN_NUMBER = {
  [CHAINS.bsc]: '56',
  [CHAINS.polygon]: '137',
  [CHAINS.arbitrum]: '42161',
  [CHAINS.fantom]: '250',
};

const POOL_DIRECTORY_ADDRESS = {
  [CHAINS.bsc]: '0x295d7347606F4bd810C8296bb8d75D657001fcf7',
  [CHAINS.polygon]: '0x9A161e68EC0d5364f4d09A6080920DAFF6FFf250',
  [CHAINS.arbitrum]: '0x68e8f59eA33FbccA716f56f89F47e53C73d47830',
  [CHAINS.fantom]: '0xE622c2967E2885ED04436075889C88696328aBE8',
};

const POOL_LENS_ADDRESS = {
  [CHAINS.bsc]: '0x47246c2e75409284b6409534d410245Ee48002c7',
  [CHAINS.polygon]: '0xa9b97cb26eA3a5f33Fa1b8D88C00962eA4501558',
  [CHAINS.arbitrum]: '0x062CEc1fa0F54cccd513c5b8aa86cBead5d1e55d',
  [CHAINS.fantom]: '0x79AAb023F3cdCf5a8314E88bfb9EE88ecd3e12e7',
};

const MIDAS_FLYWHEEL_LENS_ROUTER = {
  [CHAINS.bsc]: '0xb4c8353412633B779893Bb728435930b7d3610C8',
  [CHAINS.polygon]: '0xda359cB8c4732C7260CD72dD052CD053765f1Dcf',
  [CHAINS.arbitrum]: '0xFe5aF5765A7cCD1538E4ee4B501BC7fe93ec8EBa',
  [CHAINS.fantom]: '0xFe5aF5765A7cCD1538E4ee4B501BC7fe93ec8EBa',
};

const CG_KEY = {
  [CHAINS.bsc]: 'coingecko:binancecoin',
  [CHAINS.polygon]: 'coingecko:matic-network',
  [CHAINS.arbitrum]: 'coingecko:ethereum',
  [CHAINS.fantom]: 'coingecko:fantom',
};

const BLOCKS_PER_MIN = {
  [CHAINS.bsc]: 20,
  [CHAINS.polygon]: 26,
  [CHAINS.arbitrum]: 4,
  [CHAINS.fantom]: 60,
};

const GET_ACTIVE_POOLS = 'getActivePools';
const POOLS = 'pools';
const GET_POOL_ASSETS_WITH_DATA = 'getPoolAssetsWithData';
const GET_MARKET_REWARDS_INFO = 'getMarketRewardsInfo';
const GET_MARKET_REWARDS_INFO_ARBITRUM = 'getPoolMarketRewardsInfo';

const PROJECT_NAME = 'midas-capital';
const PROJECT_URL = 'https://development.midascapital.xyz';

const ratePerBlockToAPY = (ratePerBlock, blocksPerMin) => {
  const blocksPerDay = blocksPerMin * 60 * 24;
  const daysPerYear = 365;
  const rateAsNumber = Number(ethers.utils.formatUnits(ratePerBlock, 18));

  return (Math.pow(rateAsNumber * blocksPerDay + 1, daysPerYear) - 1) * 100;
};

const getPluginRewards = async (pluginAddress, chain) => {
  if (pluginAddress) {
    const res = (
      await superagent.get(
        `${PROJECT_URL}/api/public/rewards?chainId=${CHAIN_NUMBER[chain]}&pluginAddress=${pluginAddress}`
      )
    ).body;

    return res;
  } else {
    return undefined;
  }
};

const main = async () => {
  const markets = [];

  for (const chain of Object.keys(CHAINS)) {
    const [poolIndexes, pools] = (
      await sdk.api.abi.call({
        target: POOL_DIRECTORY_ADDRESS[chain],
        chain: chain,
        abi: poolDirectoryAbi.find(({ name }) => name === GET_ACTIVE_POOLS),
      })
    ).output;

    const allMarkets = [];

    for (const [index, poolId] of poolIndexes.entries()) {
      try {
        const { comptroller } = (
          await sdk.api.abi.call({
            target: POOL_DIRECTORY_ADDRESS[chain],
            chain: chain,
            abi: poolDirectoryAbi.find(({ name }) => name === POOLS),
            params: [Number(poolId)],
          })
        ).output;
        const flywheelLensRouterAbi =
          chain === 'arbitrum'
            ? flywheelLensRouterAbiV2
            : flywheelLensRouterAbiV1;

        const marketRewards = (
          await sdk.api.abi
            .call({
              target: MIDAS_FLYWHEEL_LENS_ROUTER[chain],
              chain: chain,
              abi: flywheelLensRouterAbi.find(
                ({ name }) =>
                  name ===
                  (chain === 'arbitrum'
                    ? GET_MARKET_REWARDS_INFO_ARBITRUM
                    : GET_MARKET_REWARDS_INFO)
              ),
              params: [comptroller],
            })
            .catch((e) => {
              return { output: [] };
            })
        ).output;

        const adaptedMarketRewards = marketRewards
          .map((marketReward) => ({
            underlyingPrice: marketReward.underlyingPrice,
            market: marketReward.market,
            rewardsInfo: marketReward.rewardsInfo.filter(
              (info) =>
                Number(
                  ethers.utils.formatUnits(info.rewardSpeedPerSecondPerToken)
                ) > 0
            ),
          }))
          .filter((marketReward) => marketReward.rewardsInfo.length > 0);

        const assets = (
          await sdk.api.abi
            .call({
              target: POOL_LENS_ADDRESS[chain],
              chain: chain,
              abi: poolLensAbi.find(
                ({ name }) => name === GET_POOL_ASSETS_WITH_DATA
              ),
              params: [comptroller],
            })
            .catch((e) => {})
        ).output.map((obj) => {
          return Object.fromEntries(
            Object.entries(obj).filter(([k]) => isNaN(k))
          );
        });

        const assetsWithPoolInfo = assets.map((asset) => {
          asset.poolName = pools[index].name;

          const reward = adaptedMarketRewards.find(
            (reward) => reward.market === asset.cToken
          );

          if (reward) {
            asset.rewardsFromContract = reward;
          }

          return asset;
        });

        allMarkets.push(...assetsWithPoolInfo);
      } catch (e) {}
    }

    const price = (
      await superagent.get(
        `https://coins.llama.fi/prices/current/${CG_KEY[chain]}`
      )
    ).body.coins[CG_KEY[chain]].price;

    for (const market of allMarkets) {
      if (market.mintGuardianPaused && market.borrowGuardianPaused) continue;

      const totalSupplyUsd =
        Number(
          ethers.utils.formatUnits(
            market.totalSupply,
            market.underlyingDecimals
          )
        ) *
        Number(ethers.utils.formatUnits(market.underlyingPrice, 18)) *
        price;

      const totalBorrowUsd =
        Number(
          ethers.utils.formatUnits(
            market.totalBorrow,
            market.underlyingDecimals
          )
        ) *
        Number(ethers.utils.formatUnits(market.underlyingPrice, 18)) *
        price;

      const tvlUsd = totalSupplyUsd - totalBorrowUsd;
      const apyBase = ratePerBlockToAPY(
        market.supplyRatePerBlock,
        BLOCKS_PER_MIN[chain]
      );
      const apyBaseBorrow = ratePerBlockToAPY(
        market.borrowRatePerBlock,
        BLOCKS_PER_MIN[chain]
      );

      const pluginAddress = (
        await superagent.get(
          `${PROJECT_URL}/api/public/plugins?chainId=${CHAIN_NUMBER[chain]}&marketAddress=${market.cToken}`
        )
      ).body;

      const pluginRewards = await getPluginRewards(pluginAddress, chain);
      const allRewards =
        pluginRewards && pluginRewards.length > 0 ? [...pluginRewards] : [];
      const rewardTokens =
        pluginRewards && pluginRewards.length > 0
          ? [pluginRewards[0].plugin]
          : [];

      if (market.rewardsFromContract) {
        const flywheelsInPluginResponse = pluginRewards
          ? pluginRewards
              .map((pluginReward) =>
                'flywheel' in pluginReward
                  ? pluginReward.flywheel.toLowerCase()
                  : null
              )
              .filter((f) => !!f)
          : [];

        for (const info of market.rewardsFromContract.rewardsInfo) {
          if (
            !flywheelsInPluginResponse.includes(info.flywheel.toLowerCase())
          ) {
            allRewards.push({
              flywheel: info.flywheel,
              apy: info.formattedAPR
                ? Number(ethers.utils.formatUnits(info.formattedAPR))
                : undefined,
              token: info.rewardToken,
            });

            if (!rewardTokens.includes(info.rewardToken)) {
              rewardTokens.push(info.rewardToken);
            }
          }
        }
      }

      const apyReward = allRewards.reduce(
        (apy, obj) =>
          obj.status !== 'paused' && obj.apy !== undefined
            ? apy + Number(obj.apy) * 100
            : apy,
        0
      );

      markets.push({
        pool: market.cToken.toLowerCase(),
        chain: utils.formatChain(chain),
        project: PROJECT_NAME,
        symbol: market.underlyingSymbol.toLowerCase(),
        tvlUsd,
        apyBase,
        apyReward,
        underlyingTokens: [market.underlyingToken],
        rewardTokens,
        totalSupplyUsd,
        totalBorrowUsd,
        apyBaseBorrow,
        apyRewardBorrow: undefined,
        ltv: Number(ethers.utils.formatUnits(market.collateralFactor)),
        borrowable: !market.borrowGuardianPaused,
        poolMeta: `${market.poolName} pool in ${chain}`,
      });
    }
  }

  return markets;
};

module.exports = {
  timetravel: false,
  apy: main,
  url: PROJECT_URL,
};
