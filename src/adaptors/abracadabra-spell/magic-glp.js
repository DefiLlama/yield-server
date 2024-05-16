const sdk = require('@defillama/sdk');
const utils = require('../utils');

const ERC4626 = require('./abis/ERC4626.json');
const GLP_MANAGER = require('./abis/GlpManager.json');
const MAGIC_GLP_HARVESTOR = require('./abis/MagicGlpHarvestor.json');
const REWARD_TRACKER = require('./abis/RewardTracker.json');

const HOURS_PER_YEAR = 8760;
const SECONDS_PER_YEAR = 31536000;
const HARVESTS_PER_YEAR = HOURS_PER_YEAR;
const MAGIC_GLP_POOLS = {
  arbitrum: {
    magicGlpAddress: '0x85667409a723684fe1e57dd1abde8d88c2f54214',
    glp: {
      address: '0x4277f8f2c384827b5273592ff7cebd9f2c1ac258',
      decimals: 18,
    },
    glpManagerAddress: '0x3963ffc9dff443c2a94f21b129d429891e32ec18',
    harvestorAddress: '0xc99a4863173ef52ccb7ea05440da0e37ba39c139',
    glpRewardTrackerAddresses: [
      '0x4e971a87900b931ff39d1aad67697f49835400b6',
      '0x1addd80e6039594ee970e5872d247bf0414c8903',
    ],
  },
  avax: {
    magicGlpAddress: '0x5efc10c353fa30c5758037fdf0a233e971ecc2e0',
    glp: {
      address: '0x01234181085565ed162a948b6a5e88758cd7c7b8',
      decimals: 18,
    },
    glpManagerAddress: '0xd152c7f25db7f4b95b7658323c5f33d176818ee4',
    harvestorAddress: '0x05b3b96df07b4630373ae7506e51777b547335b0',
    glpRewardTrackerAddresses: [
      '0xd2d1162512f927a7e282ef43a362659e4f2a728f',
      '0x9e295b5b976a184b14ad8cd72413ad846c299660',
    ],
  },
};

const getChainDetails = (pools, abi) =>
  Promise.all(
    Object.entries(pools).map(async ([chain, chainPools]) => {
      const responses = await utils.makeMulticall(abi, chainPools, chain);
      const associatedResponses = Object.fromEntries(
        responses.map((response, index) => [chainPools[index], response])
      );
      return [chain, associatedResponses];
    })
  ).then(Object.fromEntries);

const getChainDetail = (pools, abi) =>
  Promise.all(
    Object.entries(pools).map(async ([chain, target]) => {
      const response = await sdk.api.abi
        .call({
          target,
          abi,
          chain,
        })
        .then(({ output }) => output);
      return [chain, response];
    })
  ).then(Object.fromEntries);

const getHarvestFees = (magicGlpPools) =>
  Promise.all(
    Object.entries(magicGlpPools).map(async ([chain, { harvestorAddress }]) => {
      const fee = await sdk.api.abi
        .call({
          target: harvestorAddress,
          abi: MAGIC_GLP_HARVESTOR.find((abi) => abi.name === 'feePercentBips'),
          chain,
        })
        .then(({ output }) => output / 10000);
      return [chain, fee];
    })
  ).then(Object.fromEntries);

const getGlpAum = (magicGlpPools) =>
  Promise.all(
    Object.entries(magicGlpPools).map(
      async ([chain, { glpManagerAddress }]) => {
        const [price, pricePrecision] = await Promise.all([
          sdk.api.abi
            .call({
              target: glpManagerAddress,
              abi: GLP_MANAGER.find((abi) => abi.name === 'getAum'),
              params: [false],
              chain,
            })
            .then(({ output }) => output),
          sdk.api.abi
            .call({
              target: glpManagerAddress,
              abi: GLP_MANAGER.find((abi) => abi.name === 'PRICE_PRECISION'),
              chain,
            })
            .then(({ output }) => output),
        ]);
        return [chain, price / pricePrecision];
      }
    )
  ).then(Object.fromEntries);

const getGlpPrice = (magicGlpPools) =>
  Promise.all(
    Object.entries(magicGlpPools).map(
      async ([chain, { glpManagerAddress }]) => {
        const [price, pricePrecision] = await Promise.all([
          sdk.api.abi
            .call({
              target: glpManagerAddress,
              abi: GLP_MANAGER.find((abi) => abi.name === 'getPrice'),
              params: [false],
              chain,
            })
            .then(({ output }) => output),
          sdk.api.abi
            .call({
              target: glpManagerAddress,
              abi: GLP_MANAGER.find((abi) => abi.name === 'PRICE_PRECISION'),
              chain,
            })
            .then(({ output }) => output),
        ]);
        return [chain, price / pricePrecision];
      }
    )
  ).then(Object.fromEntries);

const getGlpRewards = (magicGlpPools) =>
  Promise.all(
    Object.entries(magicGlpPools).map(
      async ([chain, { glpRewardTrackerAddresses }]) => {
        const [rewardTokens, tokensPerInterval] = await Promise.all([
          utils.makeMulticall(
            REWARD_TRACKER.find((abi) => abi.name === 'rewardToken'),
            glpRewardTrackerAddresses,
            chain
          ),
          utils.makeMulticall(
            REWARD_TRACKER.find((abi) => abi.name === 'tokensPerInterval'),
            glpRewardTrackerAddresses,
            chain
          ),
        ]);
        const rewards = rewardTokens.map((rewardToken, index) => ({
          rewardToken: rewardToken.toLowerCase(),
          tokensPerInterval: tokensPerInterval[index],
        }));
        return [chain, rewards];
      }
    )
  ).then(Object.fromEntries);

const getApy = async () => {
  const glpRewardsPromise = getGlpRewards(MAGIC_GLP_POOLS);
  const [
    magicGlpTotalAssets,
    harvestFees,
    glpAum,
    glpPrice,
    glpRewards,
    glpRewardTokenDecimals,
    pricesObj,
  ] = await Promise.all([
    getChainDetail(
      Object.fromEntries(
        Object.entries(MAGIC_GLP_POOLS).map(([chain, { magicGlpAddress }]) => [
          chain,
          magicGlpAddress,
        ])
      ),
      ERC4626.find((abi) => abi.name === 'totalAssets')
    ),
    getHarvestFees(MAGIC_GLP_POOLS),
    getGlpAum(MAGIC_GLP_POOLS),
    getGlpPrice(MAGIC_GLP_POOLS),
    glpRewardsPromise,
    glpRewardsPromise.then((glpRewards) =>
      getChainDetails(
        Object.fromEntries(
          Object.entries(glpRewards).map(([chain, chainGlpRewards]) => [
            chain,
            chainGlpRewards.map(({ rewardToken }) => rewardToken),
          ])
        ),
        'erc20:decimals'
      )
    ),
    glpRewardsPromise.then(async (glpRewards) => {
      const coins = Object.entries(glpRewards).flatMap(
        ([chain, chainGlpRewards]) =>
          chainGlpRewards.map(({ rewardToken }) => `${chain}:${rewardToken}`)
      );
      return utils.getPrices(coins);
    }),
  ]);

  return Object.entries(MAGIC_GLP_POOLS).map(
    ([chain, { magicGlpAddress, glp }]) => {
      const usdRewardsPerInterval = glpRewards[chain]
        .map(({ rewardToken, tokensPerInterval }) => {
          const rewardTokenPrice = pricesObj.pricesByAddress[rewardToken] ?? 0;
          return (
            (tokensPerInterval * rewardTokenPrice) /
            10 ** glpRewardTokenDecimals[chain][rewardToken]
          );
        })
        .reduce((a, b) => a + b, 0);
      const usdRewardsPerYear = usdRewardsPerInterval * SECONDS_PER_YEAR;
      const glpApr = usdRewardsPerYear / glpAum[chain];
      const magicGlpApy =
        (1 + (glpApr * (1 - harvestFees[chain])) / HARVESTS_PER_YEAR) **
          HARVESTS_PER_YEAR -
        1;

      return {
        pool: `${magicGlpAddress}-magicglp-${chain}`,
        chain: utils.formatChain(chain),
        project: 'abracadabra-spell',
        symbol: utils.formatSymbol('magicGLP'),
        tvlUsd:
          (magicGlpTotalAssets[chain] / 10 ** glp.decimals) * glpPrice[chain],
        apyBase: magicGlpApy * 100,
        underlyingTokens: [glp.address],
      };
    }
  );
};

module.exports = getApy;
