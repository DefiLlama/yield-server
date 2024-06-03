const sdk = require('@defillama/sdk');
const utils = require('../utils');
const {
  boosterABI,
  stakingABI,
  miningABI,
  virtualBalanceRewardPoolABI,
  stashTokenABI,
  lpTokenABI,
  lpTokenABI2,
  vaultABI,
} = require('./abis');
const _ = require('lodash');
const ethers = require('ethers');

const RewardAssetConfig = {
  auraAddress: '0xC0c293ce456fF0ED870ADd98a0828Dd4d2903DBF',
  balAddress: '0xba100000625a3754423978a60c9317c58a424e3D',
};

const ChainConfig = {
  ethereum: {
    booster: '0xA57b8d98dAE62B26Ec3bcC4a365338157060B234',
    balancerVault: '0xBA12222222228d8Ba445958a75a0704d566BF2C8',
    auraRewardsCalculator: '0x744Be650cea753de1e69BF6BAd3c98490A855f52',
    auraAddress: RewardAssetConfig.auraAddress,
    balAddress: RewardAssetConfig.balAddress,
    ldoAddress: '0x5A98FcBEA516Cf06857215779Fd812CA3beF1B32',
  },
  arbitrum: {
    booster: '0x98Ef32edd24e2c92525E59afc4475C1242a30184',
    balancerVault: '0xBA12222222228d8Ba445958a75a0704d566BF2C8',
    auraRewardsCalculator: '0x52A7239eDa381264b8c24cB11d7dF343236007Aa',
    auraAddress: '0x1509706a6c66CA549ff0cB464de88231DDBe213B',
    balAddress: '0xFE8B128bA8C78aabC59d4c64cEE7fF28e9379921',
    ldoAddress: '0x13Ad51ed4F1B7e9Dc168d8a00cB3f4dDD85EfA60',
    chainTokens: ['0x912ce59144191c1204e64559fe8253a0e49e6548'], // ARB
  },
  optimism: {
    booster: '0x98Ef32edd24e2c92525E59afc4475C1242a30184',
    balancerVault: '0xBA12222222228d8Ba445958a75a0704d566BF2C8',
    auraRewardsCalculator: '0x6306B10E032f9f81D3279D52FAaf6b0cdb53292a',
    auraAddress: '0x1509706a6c66CA549ff0cB464de88231DDBe213B',
    balAddress: '0xFE8B128bA8C78aabC59d4c64cEE7fF28e9379921',
    ldoAddress: '0xFdb794692724153d1488CcdBE0C56c252596735F',
    chainTokens: [
      '0x4200000000000000000000000000000000000042',
      '0x39FdE572a18448F8139b7788099F0a0740f51205',
    ], // OP, OATH
  },
  xdai: {
    booster: '0x98Ef32edd24e2c92525E59afc4475C1242a30184',
    balancerVault: '0xBA12222222228d8Ba445958a75a0704d566BF2C8',
    auraRewardsCalculator: '0x7deBB37D0b199F5a365Be63C228A85A22Aaa72DE',
    auraAddress: '0x1509706a6c66CA549ff0cB464de88231DDBe213B',
    balAddress: '0x7eF541E2a22058048904fE5744f9c7E4C57AF717',
    ldoAddress: '0x96e334926454CD4B7b4efb8a8fcb650a738aD244',
    chainTokens: ['0x9C58BAcC331c9aa871AFD802DB6379a98e80CEdb'], // GNO
  },
};

const SECONDS_PER_YEAR = 60 * 60 * 24 * 365;
const SWAP_APR_API = 'https://cache.aura.finance/aura/aprs-deprecated';

const main = async () => {
  const { pools: swapAprs } = await utils.getData(SWAP_APR_API);

  const rewardAssetKeys = [
    RewardAssetConfig.auraAddress,
    RewardAssetConfig.balAddress,
  ]
    .map((i) => `ethereum:${i}`)
    .join(',')
    .toLowerCase();
  const rewardTokenPrices = (
    await utils.getData(
      `https://coins.llama.fi/prices/current/${rewardAssetKeys}`
    )
  ).coins;
  const auraPrice =
    rewardTokenPrices[`ethereum:${RewardAssetConfig.auraAddress.toLowerCase()}`]
      ?.price;
  const balPrice =
    rewardTokenPrices[`ethereum:${RewardAssetConfig.balAddress.toLowerCase()}`]
      ?.price;
  const allPools = [];
  for (let chain in ChainConfig) {
    const {
      booster,
      balancerVault,
      auraRewardsCalculator,
      auraAddress,
      balAddress,
      ldoAddress,
      chainTokens,
    } = ChainConfig[chain];

    const poolLength = parseInt(
      (
        await sdk.api.abi.call({
          abi: boosterABI.filter(({ name }) => name === 'poolLength')[0],
          target: booster,
          chain: chain,
          permitFailure: true,
        })
      ).output
    );

    const allAuraPools = (
      await sdk.api.abi.multiCall({
        abi: boosterABI.filter(({ name }) => name === 'poolInfo')[0],
        calls: _.range(poolLength).map((index) => ({
          chain,
          target: booster,
          params: [index],
        })),
        chain,
        permitFailure: true,
      })
    ).output.map(({ output }) => output);
    const validPools = allAuraPools.filter(
      (poolInfo) => poolInfo.shutdown == false
    );
    const validPoolIds = validPools.map((poolInfo) =>
      allAuraPools.indexOf(poolInfo)
    );
    const validPoolsLength = validPools.length;

    const gaugeContracts = validPools.map((poolInfo) => poolInfo.gauge);
    const lpTokens = validPools.map((poolInfo) => poolInfo.lptoken);
    const stakingContracts = validPools.map((poolInfo) => poolInfo.crvRewards);

    const totalSupply = (
      await sdk.api.abi.multiCall({
        chain,
        calls: validPools.map((p) => ({ target: p.token })),
        abi: 'erc20:totalSupply',
        permitFailure: true,
      })
    ).output.map((o) => o.output);

    const allTokenKeys = [
      ...lpTokens,
      auraAddress,
      balAddress,
      ldoAddress,
      ...(chainTokens !== undefined ? chainTokens : []),
    ]
      .map((i) => `${chain}:${i}`)
      .join(',')
      .toLowerCase();

    const tokenPrices = (
      await utils.getData(
        `https://coins.llama.fi/prices/current/${allTokenKeys}`
      )
    ).coins;

    const poolTVLs = _.range(validPoolsLength).map((i) => {
      if (`${chain}:${lpTokens[i].toLowerCase()}` in tokenPrices) {
        return (
          (totalSupply[i] / 1e18) *
          tokenPrices[`${chain}:${lpTokens[i].toLowerCase()}`]?.price
        );
      } else {
        return 0;
      }
    });

    const balRewardPerSecondRates = (
      await sdk.api.abi.multiCall({
        abi: stakingABI.filter(({ name }) => name === 'rewardRate')[0],
        calls: _.range(validPoolsLength).map((i) => ({
          target: stakingContracts[i],
        })),
        chain,
        permitFailure: true,
      })
    ).output.map(({ output }) => output);
    const balRewardPerYearRates = balRewardPerSecondRates.map(
      (i) => i * SECONDS_PER_YEAR
    );
    const auraRewardPerYearRates = (
      await sdk.api.abi.multiCall({
        abi: miningABI.filter(({ name }) => name === 'convertCrvToCvx')[0],
        calls: _.range(validPoolsLength).map((i) => ({
          target: auraRewardsCalculator,
          params: [BigInt(balRewardPerYearRates[i])],
        })),
        chain,
        permitFailure: true,
      })
    ).output.map(({ output }) => output);

    const balAPYs = _.range(validPoolsLength).map((i) => {
      if (poolTVLs[i] === 0) {
        return 0;
      }
      return ((balRewardPerYearRates[i] / 1e18) * balPrice * 100) / poolTVLs[i];
    });

    const auraAPYs = _.range(validPoolsLength).map(
      (i) =>
        ((auraRewardPerYearRates[i] / 1e18) * auraPrice * 100) / poolTVLs[i]
    );
    const extraRewardLengths = (
      await sdk.api.abi.multiCall({
        abi: stakingABI.filter(({ name }) => name === 'extraRewardsLength')[0],
        calls: _.range(validPoolsLength).map((i) => ({
          target: stakingContracts[i],
        })),
        chain,
        permitFailure: true,
      })
    ).output.map(({ output }) => output);

    const balancerPoolIds = (
      await sdk.api.abi.multiCall({
        abi: lpTokenABI.filter(({ name }) => name === 'getPoolId')[0],
        calls: _.range(validPoolsLength).map((i) => ({
          target: lpTokens[i],
        })),
        chain,
        permitFailure: true,
      })
    ).output.map(({ output }) => output);

    // Some of the pools do not have `getPoolId` so we use an alternative method to get the pool id
    await Promise.all(
      _.range(validPoolsLength).map(async (i) => {
        if (balancerPoolIds[i]) {
          return;
        }
        balancerPoolIds[i] = (
          await sdk.api.abi.call({
            abi: lpTokenABI2.filter(({ name }) => name === 'POOL_ID')[0],
            target: lpTokens[i],
            chain,
            permitFailure: true,
          })
        ).output;
      })
    );

    const balancerPoolTokenInfos = (
      await sdk.api.abi.multiCall({
        abi: vaultABI.filter(({ name }) => name === 'getPoolTokens')[0],
        calls: _.range(validPoolsLength).map((i) => ({
          target: balancerVault,
          params: [balancerPoolIds[i]],
        })),
        chain,
        permitFailure: true,
      })
    ).output.map(({ output }) => output);

    const underlyingTokens = _.range(validPoolsLength).map((i) =>
      balancerPoolTokenInfos[i].tokens.filter((token) => token !== lpTokens[i])
    );

    const uniqueTokens = Array.from(new Set(_.flatten(underlyingTokens)));
    const uniqueTokenSymbols = (
      await sdk.api.abi.multiCall({
        abi: 'erc20:symbol',
        calls: uniqueTokens.map((target) => ({
          target,
        })),
        chain,
        permitFailure: true,
      })
    ).output.map(({ output }) => output);

    const tokenToSymbolMap = uniqueTokens.reduce((obj, token, index) => {
      obj[token] = uniqueTokenSymbols[index];
      return obj;
    }, {});
    const chainPools = await Promise.all(
      _.range(validPoolsLength).map(async (i) => {
        const data = {
          pool: lpTokens[i].toLowerCase(),
          chain,
          project: 'aura',
          symbol: underlyingTokens[i]
            .map((token) => tokenToSymbolMap[token])
            .join('-'),
          tvlUsd: poolTVLs[i],
          apyReward: auraAPYs[i] + balAPYs[i],
          underlyingTokens: underlyingTokens[i],
          rewardTokens: [
            ethers.utils.getAddress(auraAddress),
            ethers.utils.getAddress(balAddress),
          ],
          url: `https://app.aura.finance/#/1/pool/${validPoolIds[i]}`,
        };

        // There are not too many extra reward pools so we do individual calls to simplify
        for (let x = 0; x < extraRewardLengths[i]; x++) {
          const virtualBalanceRewardPool = (
            await sdk.api.abi.call({
              abi: stakingABI.filter(({ name }) => name === 'extraRewards')[0],
              target: stakingContracts[i],
              chain,
              params: [x],
              permitFailure: true,
            })
          ).output;

          const extraRewardRate = (
            await sdk.api.abi.call({
              abi: virtualBalanceRewardPoolABI.filter(
                ({ name }) => name === 'rewardRate'
              )[0],
              target: virtualBalanceRewardPool,
              chain,
              permitFailure: true,
            })
          ).output;

          const stashToken = (
            await sdk.api.abi.call({
              abi: virtualBalanceRewardPoolABI.filter(
                ({ name }) => name === 'rewardToken'
              )[0],
              target: virtualBalanceRewardPool,
              chain,
              permitFailure: true,
            })
          ).output;

          const baseToken = (
            await sdk.api.abi.call({
              abi: stashTokenABI.filter(({ name }) => name === 'baseToken')[0],
              target: stashToken,
              chain,
              permitFailure: true,
            })
          ).output;

          let tokenPrice;
          if (auraAddress === baseToken) {
            tokenPrice = auraPrice;
          } else if (
            (chain === 'ethereum' &&
              ![ldoAddress, auraAddress].includes(baseToken)) ||
            !(`${chain}:${baseToken.toLowerCase()}` in tokenPrices)
          ) {
            console.log(
              validPoolIds[i],
              'new reward token. please add support for',
              baseToken
            );
            const newTokenPrices = (
              await utils.getData(
                `https://coins.llama.fi/prices/current/${chain}:${baseToken.toLowerCase()}`
              )
            ).coins;
            tokenPrices[`${chain}:${baseToken.toLowerCase()}`] =
              newTokenPrices[`${chain}:${baseToken.toLowerCase()}`];
            tokenPrice =
              newTokenPrices[`${chain}:${baseToken.toLowerCase()}`]?.price;
          } else {
            tokenPrice =
              tokenPrices[`${chain}:${baseToken.toLowerCase()}`]?.price;
          }

          const rewardAPY =
            (((extraRewardRate / 1e18) * 86400 * 365 * tokenPrice) /
              data.tvlUsd) *
            100;
          data.rewardTokens.push(baseToken);
          data.apyReward += rewardAPY;
        }

        const swapApr = swapAprs.find(({ id }) => id === balancerPoolIds[i]);
        if (swapApr?.poolAprs) {
          data.apyBase = Number(swapApr.poolAprs.swap);
        }
        return data;
      })
    );

    allPools.push(...chainPools.filter((p) => utils.keepFinite(p)));
  }

  return allPools;
};

module.exports = {
  timetravel: false,
  apy: main,
  url: 'https://app.aura.finance/',
};
