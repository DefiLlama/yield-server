const ethers = require('ethers');
const { JsonRpcProvider } = require('ethers');
const sdk = require('@defillama/sdk');
const axios = require('axios');
const abiLendingPool = require('./abiLendingPool');
const abiProtocolDataProvider = require('./abiProtocolDataProvider');
const abiSimplifiedProtocolDataReader = require('./abiSimplifiedProtocolDataReader');

const utils = require('../utils');

const chains = {
  scroll: {
    LendingPool: '0x4cE1A1eC13DBd9084B1A741b036c061b2d58dABf',
    ProtocolDataProvider: '0xb17844F6E50f4eE8f8FeC7d9BA200B0E034b8236',
    url: 'scroll',
    SimplifiedProtocolDataReader: '0x8d21d9Cb7B6Bd1acf99C46295A9558bE6DDD2fDe',
    rewardTokens: ['0xf270bfe3f97655fff1d89aff50a8e1dc381941b5']
  },
};

const getApy = async () => {
  const pools = await Promise.all(
    Object.keys(chains).map(async (chain) => {
      const addresses = chains[chain];
      const sdkChain = chain;
      const rewardTokens = addresses.rewardTokens;

      const reservesList = (
        await sdk.api.abi.call({
          target: addresses.LendingPool,
          abi: abiLendingPool.find((m) => m.name === 'getReservesList'),
          chain: sdkChain,
        })
      ).output;

      // try catches incase of safemath error
      let rewardsData;
      try {
        rewardsData = await sdk.api.abi.multiCall({
          calls: reservesList.map((reserve) => ({
            target: addresses.SimplifiedProtocolDataReader,
            params: [reserve],
          })),
          abi: abiSimplifiedProtocolDataReader.find((m) => m.name === 'getAssetRewardsAPR'),
          chain: sdkChain,
          failOnRevert: false, // Add this option to prevent failing on reverts
        });
      } catch (error) {
        console.error(`Error fetching rewards data for chain ${chain}:`, error);
        // Implement fallback mechanism or use default values
        rewardsData = {
          output: reservesList.map(() => ({ success: false, output: null }))
        };
      }

      // Process the results, handling potential failures
      const processedRewardsData = rewardsData.output.map((result, index) => {
        if (result.success && Array.isArray(result.output) && result.output.length === 2) {
          return {
            apyReward: Number(result.output[0]) / 1.893563261 / 1e8,
            apyRewardBorrow: Number(result.output[1]) / 1.893563261 / 1e8
          };
        } else {
          console.warn(`Failed to get rewards data for reserve ${reservesList[index]} on chain ${chain}`);
          return { apyReward: 0, apyRewardBorrow: 0 };
        }
      });

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
      // maker symbol is null
      const mkrIdx = symbols.findIndex((s) => s === null);
      symbols[mkrIdx] = 'MKR';

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

      const pricesArray = reservesList.map((t) => `${sdkChain}:${t}`);
      const prices = (
        await axios.get(`https://coins.llama.fi/prices/current/${pricesArray}`)
      ).data.coins;

      return reservesList.map((t, i) => {
        const config = reserveConfigurationData[i];

        const { apyReward, apyRewardBorrow } = processedRewardsData[i];

        if (!config.isActive) return null;

        const price = prices[`${sdkChain}:${t}`]?.price;

        const tvlUsd = (liquidity[i] / 10 ** decimals[i]) * price;
        const totalBorrowUsd = (totalBorrow[i] / 10 ** decimals[i]) * price;
        const totalSupplyUsd = tvlUsd + totalBorrowUsd;

        const apyBase = reserveData[i].currentLiquidityRate / 1e25;
        const apyBaseBorrow = reserveData[i].currentVariableBorrowRate / 1e25;

        // console.log(`Raw reward data for ${symbols[i]}:`, rewardsData.output[i]?.output);
        // console.log(`Parsed apyReward for ${symbols[i]}:`, apyReward);
        // console.log(`Parsed apyRewardBorrow for ${symbols[i]}:`, apyRewardBorrow);

        const ltv = config.ltv / 1e4;
        const borrowable = config.borrowingEnabled;
        const frozen = config.isFrozen;
        const poolSymbol = symbols[i].toLowerCase()
        const url = `https://app.lore.finance/markets/${poolSymbol}`;

        return {
          pool: `${reserveData[i].aTokenAddress}-${chain}`.toLowerCase(),
          symbol: symbols[i],
          project: 'lore-finance',
          chain,
          tvlUsd,
          apyBase,
          // apyReward,
          underlyingTokens: [t],
          url,
          // borrow fields
          totalSupplyUsd,
          totalBorrowUsd,
          apyBaseBorrow,
          // apyRewardBorrow,
          // rewardTokens,
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
