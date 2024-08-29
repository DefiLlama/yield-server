const sdk = require('@defillama/sdk');
const axios = require('axios');
const { request, gql } = require('graphql-request');
const abiLendingPool = require('./abiLendingPool');
const abiProtocolDataProvider = require('./abiProtocolDataProvider');
const abiIncentivesController = require('./abiIncentivesController');

const utils = require('../utils');

const SECONDS_PER_YEAR = 60 * 60 * 24 * 365;

const chains = {
  xdai: {
    LendingPool: '0x5E15d5E33d318dCEd84Bfe3F4EACe07909bE6d9c',
    ProtocolDataProvider: '0xE6729389DEa76D47b5BcB0bA5c080821c3B51329',
    IncentivesController: '0xfa255f5104f129b78f477e9a6d050a02f31a5d86',
    reward_subgraph: sdk.graph.modifyEndpoint('EJezH1Cp31QkKPaBDerhVPRWsKVZLrDfzjrLqpmv6cGg'),
  },
};

const query = gql`
  query BalancerV2Pool {
    pool(
      id: "0x388cae2f7d3704c937313d990298ba67d70a3709000200000000000000000026"
    ) {
      totalLiquidity
      totalShares
    }
  }
`;

const getApy = async () => {
  const pools = await Promise.all(
    Object.keys(chains).map(async (chain) => {
      const addresses = chains[chain];
      const sdkChain = chain;
      const reservesList = (
        await sdk.api.abi.call({
          target: addresses.LendingPool,
          abi: abiLendingPool.find((m) => m.name === 'getReservesList'),
          chain: sdkChain,
        })
      ).output;

      const reserveData = (
        await sdk.api.abi.multiCall({
          calls: reservesList.map((i) => ({
            target: addresses.LendingPool,
            params: [i],
          })),
          abi: abiLendingPool.find((m) => m.name === 'getReserveData'),
          chain: sdkChain,
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
            chain: sdkChain,
          })
        )
      );

      const liquidity = liquidityRes.output.map((o) => o.output);
      const decimals = decimalsRes.output.map((o) => o.output);
      let symbols = symbolsRes.output.map((o) => o.output);

      const totalBorrow = (
        await sdk.api.abi.multiCall({
          abi: 'erc20:totalSupply',
          calls: reserveData.map((p) => ({
            target: p.variableDebtTokenAddress,
          })),
          chain: sdkChain,
        })
      ).output.map((o) => o.output);

      const reserveConfigurationData = (
        await sdk.api.abi.multiCall({
          calls: reservesList.map((t) => ({
            target: addresses.ProtocolDataProvider,
            params: t,
          })),
          chain: sdkChain,
          abi: abiProtocolDataProvider.find(
            (n) => n.name === 'getReserveConfigurationData'
          ),
        })
      ).output.map((o) => o.output);

      const incentivesVariableDebtTokenData = (
        await sdk.api.abi.multiCall({
          calls: reserveData.map((t) => ({
            target: addresses.IncentivesController,
            params: t.variableDebtTokenAddress,
          })),
          chain: sdkChain,
          abi: abiIncentivesController.find((n) => n.name === 'getAssetData'),
        })
      ).output.map((o) => o.output);

      const incentivesAgTokenData = (
        await sdk.api.abi.multiCall({
          calls: reserveData.map((t) => ({
            target: addresses.IncentivesController,
            params: t.aTokenAddress,
          })),
          chain: sdkChain,
          abi: abiIncentivesController.find((n) => n.name === 'getAssetData'),
        })
      ).output.map((o) => o.output);

      const pricesArray = reservesList.map((t) => `${sdkChain}:${t}`);
      const prices = (
        await axios.get(`https://coins.llama.fi/prices/current/${pricesArray}`)
      ).data.coins;

      const rewardTokenData = await request(addresses.reward_subgraph, query);

      return reservesList.map((t, i) => {
        const config = reserveConfigurationData[i];
        if (!config.isActive) return null;

        const price = prices[`${sdkChain}:${t}`]?.price;
        const rewardTokenPrice =
          rewardTokenData.pool.totalLiquidity /
          rewardTokenData.pool.totalShares;

        const tvlUsd = (liquidity[i] / 10 ** decimals[i]) * price;
        const totalBorrowUsd = (totalBorrow[i] / 10 ** decimals[i]) * price;
        const totalSupplyUsd = tvlUsd + totalBorrowUsd;

        const apyBase = reserveData[i].currentLiquidityRate / 1e25;
        const apyBaseBorrow = reserveData[i].currentVariableBorrowRate / 1e25;

        const apyReward =
          incentivesAgTokenData[i] && totalSupplyUsd
            ? (incentivesAgTokenData[i][1] *
                rewardTokenPrice *
                SECONDS_PER_YEAR) /
              (totalSupplyUsd * 10e18)
            : 0;
        const apyRewardBorrow =
          incentivesVariableDebtTokenData[i] && totalBorrowUsd
            ? (incentivesVariableDebtTokenData[i][1] *
                SECONDS_PER_YEAR *
                rewardTokenPrice) /
              (totalBorrowUsd * 10e18)
            : 0;

        const ltv = config.ltv / 1e4;
        const borrowable = config.borrowingEnabled;
        const frozen = config.isFrozen;
        const url = `https://agave.finance/markets/${symbols[i]}`;

        return {
          pool: `${reserveData[i].aTokenAddress}-${chain}`.toLowerCase(),
          symbol: symbols[i],
          project: 'agave',
          chain,
          tvlUsd,
          apyBase,
          apyReward,
          rewardTokens: ['0x388Cae2f7d3704C937313d990298Ba67D70a3709'], // Geist
          underlyingTokens: [t],
          url,
          // borrow fields
          totalSupplyUsd,
          totalBorrowUsd,
          apyBaseBorrow,
          apyRewardBorrow,
          ltv,
          borrowable,
          poolMeta: frozen ? 'frozen' : null,
        };
      });
    })
  );
  return pools.flat().filter((p) => utils.keepFinite(p));
};

module.exports = {
  apy: getApy,
};
