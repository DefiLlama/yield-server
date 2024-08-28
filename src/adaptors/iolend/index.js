const sdk = require('@defillama/sdk');
const utils = require('../utils');
const axios = require('axios');
const abiLendingPool = require('./abiLendingPool');
const abiProtocolDataProvider = require('./abiProtocolDataProvider');
const abiChefIncentivesController = require('./abiChefIncentivesController');
const abiPriceProvider = require('./abiPriceProvider');
const { format } = require('date-fns');
const { formatUnits } = require('ethers/lib/utils');

const chains = {
  iotaevm: {
    RewardToken: '0xF5755e48B6F2F06F8ea904bdA26177CB3ca06Ff0',
    LendingPool: '0xb51d18e6D14beD6C3af796201A6f2DcEbBE7BfEE',
    ProtocolDataProvider: '0x779a294CF4D200936881c4c8d0771b8a1935fB5B',
    AddressesProvider: '0x3893e30500d13990b36C9b2A05FE210A204a2F9a',
    ChefIncentivesController: '0xE7a2ad04066D1c634BCA379fad32832D3B1475f1',
    PriceProvider: '0x427E373B0882E534ddcC71C30dd8cc83aF83b568',
  },
};

const getApy = async () => {
  const pools = await Promise.all(
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

      const rewardTokenPriceUsd = (
        await sdk.api.abi.call({
          target: addresses.PriceProvider,
          abi: abiPriceProvider.find((n) => n.name === 'getTokenPriceUsd'),
          chain,
        })
      ).output;

      const rewardTokenPriceDecimals = (
        await sdk.api.abi.call({
          target: addresses.PriceProvider,
          abi: abiPriceProvider.find((n) => n.name === 'decimals'),
          chain,
        })
      ).output;

      const rewardTokenPrice = formatUnits(
        rewardTokenPriceUsd,
        rewardTokenPriceDecimals
      );

      const pricesArray = reservesList.map((t) => `${chain}:${t}`);

      const prices = (
        await axios.get(`https://coins.llama.fi/prices/current/${pricesArray}`)
      ).data.coins;

      const rewardPerYear =
        (rewardsPerSecond / 1e18) * 86400 * 365 * rewardTokenPrice;

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
        https: return {
          pool: `${reserveData[i].aTokenAddress}-${chain}`.toLowerCase(),
          chain,
          project: 'iolend',
          symbol: symbols[i],
          tvlUsd,
          apyBase,
          apyReward: apyReward,
          rewardTokens: [chains[chain].RewardToken],
          underlyingTokens: [t],
          poolMeta: frozen ? 'frozen' : null,
          url: `https://www.iolend.fi/reserve-overview/${t}-${t}${chains[chain].AddressesProvider}`.toLowerCase(),
          // optional lending protocol specific fields:
          apyBaseBorrow,
          apyRewardBorrow: apyRewardBorrow,
          totalSupplyUsd,
          totalBorrowUsd,
          ltv,
          borrowable,
        };
      });
    })
  );
  return pools.flat().filter((p) => utils.keepFinite(p));
};

module.exports = {
  apy: getApy,
};
