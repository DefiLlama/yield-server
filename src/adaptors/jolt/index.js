const sdk = require('@defillama/sdk');
const axios = require('axios');
const abiAToken = require('./abiAToken');
const abiUniswap = require('./abiUniswap');
const abiLendingPool = require('./abiLendingPool');
const abiProtocolDataProvider = require('./abiProtocolDataProvider');
const { default: BigNumber } = require('bignumber.js');
const abiChefIncentivesController = require('./abiChefIncentivesController');

const utils = require('../utils');

const earlyExitPenalty = 1 - 0.5;
const JOLT = '0xd549aa17c5010a33ca5e3d2051b8904b5a279b0a';

const chains = {
  optimism: {
    LendingPool: '0x2ABC4DE4ceB60BF15Fa57122CbB07fA5a50D3C50',
    ProtocolDataProvider: '0xe9c0EFeA9236467fa9aaC41E2c728aD47aaD74d3',
    ChefIncentivesController: '0x0774275e354561c2edcaac816f2ce7971aca1d9a',
    uniswapLp: '0xd2BF5c6d948C83B7C6Bc357239E8C42E056ed295',
    url: '0x3d8a1ea95ea4afa2469bfb80d94a4f9068670e82',
    eth: 'optimism:0x4200000000000000000000000000000000000006',
  },
};

const getApy = async () => {
  console.log('getAPY');
  const pools = await Promise.allSettled(
    Object.keys(chains).map(async (chain) => {
      const addresses = chains[chain];

      const reservesList = (
        await sdk.api.abi.call({
          target: addresses.LendingPool,
          abi: abiLendingPool.find((m) => m.name === 'getReservesList'),
          chain,
        })
      ).output;

      const reserveData = (
        await sdk.api.abi.multiCall({
          calls: reservesList.map((i) => ({
            target: addresses.LendingPool,
            params: [i],
          })),
          abi: abiLendingPool.find((m) => m.name === 'getReserveData'),
          chain,
        })
      ).output.map((o) => o.output);

      const [liquidityRes, decimalsRes, symbolsRes] = await Promise.all(
        ['erc20:balanceOf', 'erc20:decimals', 'erc20:symbol'].map((method) =>
          sdk.api.abi.multiCall({
            abi: method,
            calls: reservesList.map((t, i) => ({
              target: t,
              params:
                method === 'erc20:balanceOf'
                  ? reserveData[i].aTokenAddress
                  : null,
            })),
            chain,
          })
        )
      );

      const liquidity = liquidityRes.output.map((o) => o.output);
      const decimals = decimalsRes.output.map((o) => o.output);
      const symbols = symbolsRes.output.map((o) => o.output);

      const totalBorrow = (
        await sdk.api.abi.multiCall({
          abi: 'erc20:totalSupply',
          calls: reserveData.map((p) => ({
            target: p.variableDebtTokenAddress,
          })),
          chain,
        })
      ).output.map((o) => o.output);

      const reserveConfigurationData = (
        await sdk.api.abi.multiCall({
          calls: reservesList.map((t) => ({
            target: addresses.ProtocolDataProvider,
            params: t,
          })),
          chain,
          abi: abiProtocolDataProvider.find(
            (n) => n.name === 'getReserveConfigurationData'
          ),
        })
      ).output.map((o) => o.output);

      const rewardsPerSecond = (
        await sdk.api.abi.call({
          target: addresses.ChefIncentivesController,
          abi: abiChefIncentivesController.find(
            (m) => m.name === 'rewardsPerSecond'
          ),
          chain,
        })
      ).output;

      const totalAllocPoint = (
        await sdk.api.abi.call({
          abi: abiChefIncentivesController.find(
            (n) => n.name === 'totalAllocPoint'
          ),
          target: addresses.ChefIncentivesController,
          chain,
        })
      ).output;

      const poolInfoInterest = (
        await sdk.api.abi.multiCall({
          abi: abiChefIncentivesController.find((n) => n.name === 'poolInfo'),
          calls: reserveData.map((t, i) => ({
            target: addresses.ChefIncentivesController,
            params: reserveData[i].aTokenAddress,
          })),
          chain,
        })
      ).output.map((o) => o.output);

      const poolInfoDebt = (
        await sdk.api.abi.multiCall({
          abi: abiChefIncentivesController.find((n) => n.name === 'poolInfo'),
          calls: reserveData.map((t, i) => ({
            target: addresses.ChefIncentivesController,
            params: reserveData[i].variableDebtTokenAddress,
          })),
          chain,
        })
      ).output.map((o) => o.output);

      const pricesArray = reservesList
        .map((t) => `${chain}:${t}`)
        .concat(`${chain}:${JOLT}`);

      const prices = (
        await axios.get(`https://coins.llama.fi/prices/current/${pricesArray}`)
      ).data.coins;

      const joltPrice = await getUniswapV3Price(
        addresses.uniswapLp,
        chain,
        prices[addresses.eth]?.price
      );

      const rewardPerYear = (rewardsPerSecond / 1e18) * 86400 * 365 * joltPrice;

      return reservesList.map((t, i) => {
        const config = reserveConfigurationData[i];
        if (!config.isActive) return null;

        const price = prices[`${chain}:${t}`]?.price;

        const tvlUsd = (liquidity[i] / 10 ** decimals[i]) * price;
        const totalBorrowUsd = (totalBorrow[i] / 10 ** decimals[i]) * price;
        const totalSupplyUsd = tvlUsd + totalBorrowUsd;

        const apyBase = reserveData[i].currentLiquidityRate / 1e25;
        const apyBaseBorrow = reserveData[i].currentVariableBorrowRate / 1e25;

        const apyReward =
          (((poolInfoInterest[i].allocPoint / totalAllocPoint) *
            rewardPerYear) /
            totalSupplyUsd) *
          100;

        const apyRewardBorrow =
          (((poolInfoDebt[i].allocPoint / totalAllocPoint) * rewardPerYear) /
            totalBorrowUsd) *
          100;

        const ltv = config.ltv / 1e4;
        const borrowable = config.borrowingEnabled;
        const frozen = config.isFrozen;

        // url for pools
        const url = `https://jolt.finance`;

        return {
          pool: `${reserveData[i].aTokenAddress}-${chain}`.toLowerCase(),
          symbol: symbols[i],
          project: 'jolt',
          chain,
          tvlUsd,
          apyBase,
          apyReward: apyReward,
          underlyingTokens: [t],
          // borrow fields
          totalSupplyUsd,
          totalBorrowUsd,
          apyBaseBorrow,
          apyRewardBorrow: apyRewardBorrow,
          rewardTokens: [JOLT],
          ltv,
          borrowable,
          poolMeta: frozen ? 'frozen' : null,
          url: `${url}`,
        };
      });
    })
  );
  return pools
    .filter((i) => i.status === 'fulfilled')
    .map((i) => i.value)
    .flat()
    .filter((p) => p !== null && utils.keepFinite(p));
};

async function getUniswapV3Price(uniswapLp, chain, ethPrice) {
  const { output: slot0 } = await sdk.api.abi.call({
    target: uniswapLp,
    abi: abiUniswap.find((m) => m.name === 'slot0'),
    chain,
  });

  const sqrtPriceX96 = new BigNumber(slot0[0]); // Q64.96 fixed-point

  const precisionFactor = new BigNumber('1e18');
  const numerator = sqrtPriceX96.pow(2).times(precisionFactor); // (sqrtPriceX96)^2 * 1e18
  const denominator = new BigNumber(2).pow(192); // 2^192

  const priceRatio = numerator.div(denominator);

  let price = new BigNumber('1e36').div(priceRatio);

  price = price.div(precisionFactor);

  price = price.times(ethPrice);

  return price.toFixed(2);
}

module.exports = {
  apy: getApy,
};
