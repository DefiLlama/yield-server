const axios = require('axios');
const sdk = require('@defillama/sdk');

const abiCore = require('./abiCore.json');
const abiLABDistributor = require('./abiLABDistributor.json');
const abiLToken = require('./abiLToken.json');
const abiRateModelSlope = require('./abiRateModelSlope.json');
const abiPriceCalculator = require('./abiPriceCalculator.json');
const utils = require('../utils');

const MOVEMENT_RPC = 'https://mainnet.movementnetwork.xyz/v1';

// Sanity cap on APY percentages to catch misclassification.
const MAX_APY = 1000;

const CHAINS = {
  move: {
    pool: '0xf257d40859456809be19dfee7f4c55c4d033680096aeeb4228b7a15749ab68ea',
  },
  manta: {
    CORE: '0xB7A23Fc0b066051dE58B922dC1a08f33DF748bbf',
    LABDistributor: '0x67c10B7b8eEFe92EB4DfdEeedd94263632E483b0',
    LAB: '0x20a512dbdc0d006f46e6ca11329034eb3d18c997',
    PriceCalculator: '0x90286f894020950981c9E3196BacB03A223e4cfd',
  },
  linea: {
    CORE: '0x43Eac5BFEa14531B8DE0B334E123eA98325de866',
    LABDistributor: '0x3df121931dc2e72DC4746dA933126f6d50595605',
    LAB: '0x6Bc3EDeeE5D182cd4d5d5b26F54fddA0fAB2b5D1',
    PriceCalculator: '0x42e62fec1036f874A7579806530d628a59B6d7FB',
  },
  scroll: {
    CORE: '0xEC53c830f4444a8A56455c6836b5D2aA794289Aa',
    LABDistributor: '0xF1F897601A525F57c5EA751a1F3ec5f9ADAc0321',
    LAB: '0x2A00647F45047f05BDed961Eb8ECABc42780e604',
    PriceCalculator: '0xe3168c8D1Bcf6aaF5E090F61be619c060F3aD508',
  },
};

const apy = async (chain) => {
  if (chain === 'move') {
    const pool = CHAINS[chain].pool;
    const [reservesData, incentiveData] = await Promise.all([
      utils.getData(`${MOVEMENT_RPC}/view`, {
        function: `${pool}::ui_pool_data_provider_v3::get_reserves_data`,
        type_arguments: [],
        arguments: [],
      }),
      utils.getData(`${MOVEMENT_RPC}/view`, {
        function: `${pool}::ui_incentive_data_provider_v3::get_full_reserves_incentive_data`,
        type_arguments: [],
        arguments: [pool],
      }).catch(() => null),
    ]);

    const [reserves] = reservesData;

    // Build incentive lookup by underlying asset
    const incentiveByAsset = {};
    if (incentiveData) {
      const [incentives] = incentiveData;
      for (const inc of incentives) {
        incentiveByAsset[inc.underlying_asset] = inc;
      }
    }

    // Get reward token prices
    const rewardTokenAddresses = new Set();
    for (const inc of Object.values(incentiveByAsset)) {
      for (const side of ['a_incentive_data', 'v_incentive_data']) {
        for (const reward of inc[side]?.rewards_token_information || []) {
          if (reward.reward_token_address && Number(reward.emission_per_second) > 0) {
            rewardTokenAddresses.add(reward.reward_token_address);
          }
        }
      }
    }

    // Fetch reward token prices (MOVE token = 0xa on Movement)
    let rewardPrices = {};
    if (rewardTokenAddresses.size > 0) {
      const priceKeys = [...rewardTokenAddresses]
        .map((a) => (a === '0xa' ? 'coingecko:movement' : `${chain}:${a}`))
        .join(',');
      rewardPrices = (
        await axios.get(`https://coins.llama.fi/prices/current/${priceKeys}`)
      ).data.coins;
    }

    const getRewardPrice = (addr) => {
      if (addr === '0xa') return rewardPrices['coingecko:movement']?.price;
      return rewardPrices[`${chain}:${addr}`]?.price;
    };

    return reserves.map((r) => {
      const assetPriceUsd = r.price_in_market_reference_currency / (10 ** 18);
      const assetDecimals = r.decimals;
      const availableLiquidity = r.available_liquidity / (10 ** assetDecimals);
      const totalBorrow = r.total_scaled_variable_debt / (10 ** assetDecimals);

      const liquidityUsd = availableLiquidity * assetPriceUsd;
      const totalBorrowUsd = totalBorrow * assetPriceUsd;
      const totalSupplyUsd = liquidityUsd + totalBorrowUsd;

      // Calculate reward APYs from incentive data
      let apyReward = 0;
      let apyRewardBorrow = 0;
      const rewardTokens = [];
      const inc = incentiveByAsset[r.underlying_asset];
      const now = Math.floor(Date.now() / 1000);

      if (inc) {
        for (const reward of inc.a_incentive_data?.rewards_token_information || []) {
          const emission = Number(reward.emission_per_second);
          const endTs = Number(reward.emission_end_timestamp);
          const price = getRewardPrice(reward.reward_token_address);
          const decimals = Number(reward.reward_token_decimals);
          if (emission > 0 && endTs > now && price && totalSupplyUsd > 0) {
            apyReward += ((emission / 10 ** decimals) * 86400 * 365 * price / totalSupplyUsd) * 100;
            if (!rewardTokens.includes(reward.reward_token_address)) {
              rewardTokens.push(reward.reward_token_address);
            }
          }
        }
        for (const reward of inc.v_incentive_data?.rewards_token_information || []) {
          const emission = Number(reward.emission_per_second);
          const endTs = Number(reward.emission_end_timestamp);
          const price = getRewardPrice(reward.reward_token_address);
          const decimals = Number(reward.reward_token_decimals);
          if (emission > 0 && endTs > now && price && totalBorrowUsd > 0) {
            apyRewardBorrow += ((emission / 10 ** decimals) * 86400 * 365 * price / totalBorrowUsd) * 100;
            if (!rewardTokens.includes(reward.reward_token_address)) {
              rewardTokens.push(reward.reward_token_address);
            }
          }
        }
      }

      return {
        pool: r.a_token_address,
        chain,
        project: 'layerbank',
        symbol: r.name,
        tvlUsd: liquidityUsd,
        totalSupplyUsd,
        totalBorrowUsd,
        apyBase: r.liquidity_rate / (10 ** 27) * 100,
        apyBaseBorrow: r.variable_borrow_rate / (10 ** 27) * 100,
        apyReward,
        apyRewardBorrow,
        underlyingTokens: [r.underlying_asset],
        rewardTokens,
        ltv: r.base_lt_vas_collateral / (10 ** 5),
      };
    });
  } else {
    const CORE = CHAINS[chain].CORE;
    const LABDistributor = CHAINS[chain].LABDistributor;
    const LAB = CHAINS[chain].LAB;
    const PriceCalculator = CHAINS[chain].PriceCalculator;

    const allMarkets = (
      await sdk.api.abi.call({
        target: CORE,
        chain,
        abi: abiCore.find(({ name }) => name === 'allMarkets'),
      })
    ).output;

    const marketInfoOf = (
      await sdk.api.abi.multiCall({
        chain,
        abi: abiCore.find((n) => n.name === 'marketInfoOf'),
        calls: allMarkets.map((m) => ({
          target: CORE,
          params: [m],
        })),
      })
    ).output.map((o) => o.output);

    const totalSupply = (
      await sdk.api.abi.multiCall({
        chain,
        abi: abiLToken.find((n) => n.name === 'totalSupply'),
        calls: allMarkets.map((m) => ({
          target: m,
        })),
      })
    ).output.map((o) => o.output);

    const totalBorrow = (
      await sdk.api.abi.multiCall({
        chain,
        abi: abiLToken.find((n) => n.name === 'totalBorrow'),
        calls: allMarkets.map((m) => ({
          target: m,
        })),
      })
    ).output.map((o) => o.output);

    const totalReserve = (
      await sdk.api.abi.multiCall({
        chain,
        abi: abiLToken.find((n) => n.name === 'totalReserve'),
        calls: allMarkets.map((m) => ({
          target: m,
        })),
      })
    ).output.map((o) => o.output);

    const rateModel = (
      await sdk.api.abi.multiCall({
        chain,
        abi: abiLToken.find((n) => n.name === 'rateModel'),
        calls: allMarkets.map((m) => ({
          target: m,
        })),
      })
    ).output.map((o) => o.output);

    const reserveFactor = (
      await sdk.api.abi.multiCall({
        chain,
        abi: abiLToken.find((n) => n.name === 'reserveFactor'),
        calls: allMarkets.map((m) => ({
          target: m,
        })),
      })
    ).output.map((o) => o.output);

    const cash = (
      await sdk.api.abi.multiCall({
        chain,
        abi: abiLToken.find((n) => n.name === 'getCash'),
        calls: allMarkets.map((m) => ({
          target: m,
        })),
      })
    ).output.map((o) => o.output);

    const borrowRate = (
      await sdk.api.abi.multiCall({
        chain,
        abi: abiRateModelSlope.find((n) => n.name === 'getBorrowRate'),
        calls: rateModel.map((m, i) => ({
          target: m,
          params: [cash[i], totalBorrow[i], totalReserve[i]],
        })),
      })
    ).output.map((o) => o.output);

    const supplyRate = (
      await sdk.api.abi.multiCall({
        chain,
        abi: abiRateModelSlope.find((n) => n.name === 'getSupplyRate'),
        calls: rateModel.map((m, i) => ({
          target: m,
          params: [cash[i], totalBorrow[i], totalReserve[i], reserveFactor[i]],
        })),
      })
    ).output.map((o) => o.output);

    // Read baseRatePerYear from each rate model to determine V1 vs V2 scaling.
    // V1: baseRatePerYear < 1e18 (1e18 = 100%), V2: baseRatePerYear >= 1e18 (1e18 = 1%)
    const baseRatePerYear = (
      await sdk.api.abi.multiCall({
        chain,
        abi: 'function baseRatePerYear() view returns (uint256)',
        calls: rateModel.map((m) => ({ target: m })),
      })
    ).output.map((o) => o.output);

    const distributions = (
      await sdk.api.abi.multiCall({
        chain,
        abi: abiLABDistributor.find((n) => n.name === 'distributions'),
        calls: allMarkets.map((m) => ({
          target: LABDistributor,
          params: [m],
        })),
      })
    ).output.map((o) => o.output);

    const underlying = (
      await sdk.api.abi.multiCall({
        chain,
        abi: abiLToken.find((n) => n.name === 'underlying'),
        calls: allMarkets.map((m) => ({
          target: m,
        })),
      })
    ).output.map((o) => o.output);

    const symbol = (
      await sdk.api.abi.multiCall({
        chain,
        abi: 'erc20:symbol',
        calls: underlying.map((m) => ({
          target: m,
        })),
        permitFailure: true,
      })
    ).output.map((o) => o.output);

    const decimals = (
      await sdk.api.abi.multiCall({
        chain,
        abi: 'erc20:decimals',
        calls: underlying.map((m) => ({
          target: m,
        })),
        permitFailure: true,
      })
    ).output.map((o) => o.output);

    const priceKeys = underlying.map((t) => `${chain}:${t}`).join(',');
    const prices = (
      await axios.get(`https://coins.llama.fi/prices/current/${priceKeys}`)
    ).data.coins;

    // Try to get LAB price from PriceCalculator, but handle failures gracefully
    let priceLAB = null;
    if (chain !== 'manta') {
      try {
        priceLAB = (
          await sdk.api.abi.call({
            target: PriceCalculator,
            abi: abiPriceCalculator.find((m) => m.name === 'priceOf'),
            params: [LAB],
            chain,
          })
        ).output;
      } catch (error) {
        // PriceCalculator oracle may be invalid, LAB rewards will be set to 0
        console.log(`Warning: Failed to get LAB price for ${chain}:`, error.message.split('\n')[0]);
        priceLAB = null;
      }
    }

    return allMarkets.map((p, i) => {
      const price = prices[`${chain}:${underlying[i]}`]?.price;
      const decimal = decimals[i] ?? 18;

      const totalSupplyUsd = (totalSupply[i] / 10 ** decimal) * price;
      const totalBorrowUsd = (totalBorrow[i] / 10 ** decimal) * price;
      const tvlUsd = totalSupplyUsd - totalBorrowUsd;

      // LayerBank has V1 and V2 rate models coexisting across markets:
      // - V1: baseRatePerYear < 1e18 (1e18 = 100%), per-second rates need * 100
      // - V2: baseRatePerYear >= 1e18 (1e18 = 1%), per-second rates are already 100x larger
      const isV2RateModel = BigInt(baseRatePerYear[i]) >= BigInt(1e18);
      const annualBorrowRaw = (borrowRate[i] / 1e18) * 86400 * 365;
      const annualSupplyRaw = (supplyRate[i] / 1e18) * 86400 * 365;

      let apyBase = isV2RateModel ? annualSupplyRaw : annualSupplyRaw * 100;
      let apyBaseBorrow = isV2RateModel ? annualBorrowRaw : annualBorrowRaw * 100;

      // Sanity cap to prevent grossly inflated APY from misclassification
      if (apyBase > MAX_APY) {
        console.log(
          `Warning: Capping apyBase for market ${p} (${symbol[i] ?? 'ETH'}) on ${chain}: ` +
          `${apyBase.toFixed(2)}% -> ${MAX_APY}%`
        );
        apyBase = MAX_APY;
      }
      if (apyBaseBorrow > MAX_APY) {
        console.log(
          `Warning: Capping apyBaseBorrow for market ${p} (${symbol[i] ?? 'ETH'}) on ${chain}: ` +
          `${apyBaseBorrow.toFixed(2)}% -> ${MAX_APY}%`
        );
        apyBaseBorrow = MAX_APY;
      }
      const underlyingTokens = [underlying[i]];
      const ltv = marketInfoOf[i].collateralFactor / 1e18;

      const apyReward =
        priceLAB && totalSupplyUsd > 0
          ? (((distributions[i].supplySpeed / 1e18) *
              86400 *
              365 *
              (priceLAB / 1e18)) /
              totalSupplyUsd) *
            100
          : 0;

      const apyRewardBorrow =
        priceLAB && totalBorrowUsd > 0
          ? (((distributions[i].borrowSpeed / 1e18) *
              86400 *
              365 *
              (priceLAB / 1e18)) /
              totalBorrowUsd) *
            100
          : 0;

      return {
        pool: p,
        chain,
        project: 'layerbank',
        symbol: symbol[i] ?? 'ETH',
        tvlUsd,
        totalSupplyUsd,
        totalBorrowUsd,
        apyBase,
        apyBaseBorrow,
        apyReward,
        apyRewardBorrow,
        underlyingTokens,
        rewardTokens: apyReward > 0 ? [LAB] : [],
        ltv,
      };
    });
  }
};

const main = async () => {
  const pools = await Promise.all(
    Object.keys(CHAINS).map((chain) => apy(chain))
  );
  return pools.flat().filter((i) => utils.keepFinite(i));
};

module.exports = {
  apy: main,
  url: 'https://app.layerbank.finance',
};
