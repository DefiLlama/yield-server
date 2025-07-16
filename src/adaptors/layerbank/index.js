const axios = require('axios');
const sdk = require('@defillama/sdk');

const abiCore = require('./abiCore.json');
const abiLABDistributor = require('./abiLABDistributor.json');
const abiLToken = require('./abiLToken.json');
const abiRateModelSlope = require('./abiRateModelSlope.json');
const abiPriceCalculator = require('./abiPriceCalculator.json');
const utils = require('../utils');

const MOVEMENT_RPC = 'https://mainnet.movementnetwork.xyz/v1';

const CHAINS = {
  move: {
    pool: '0xf257d40859456809be19dfee7f4c55c4d033680096aeeb4228b7a15749ab68ea',
  },
  manta: {
    CORE: '0xB7A23Fc0b066051dE58B922dC1a08f33DF748bbf',
    LABDistributor: '0x67c10B7b8eEFe92EB4DfdEeedd94263632E483b0',
    LAB: '0x20a512dbdc0d006f46e6ca11329034eb3d18c997',
    PriceCalculator: '0x38f4384B457F81A4895c93a7503c255eFd0746d2',
  },
  linea: {
    CORE: '0x43Eac5BFEa14531B8DE0B334E123eA98325de866',
    LABDistributor: '0x3df121931dc2e72DC4746dA933126f6d50595605',
    LAB: '0x6Bc3EDeeE5D182cd4d5d5b26F54fddA0fAB2b5D1',
    PriceCalculator: '0x35A8C6050591C2f65B3e926B4b2eF825E3766bd6',
  },
  scroll: {
    CORE: '0xEC53c830f4444a8A56455c6836b5D2aA794289Aa',
    LABDistributor: '0xF1F897601A525F57c5EA751a1F3ec5f9ADAc0321',
    LAB: '0x2A00647F45047f05BDed961Eb8ECABc42780e604',
    PriceCalculator: '0x760bd7Fc100F217678D1b521404D2E93Db7Bec5F',
  },
};

const apy = async (chain) => {
  if (chain === 'move') {
    const reservesData = await utils.getData(`${MOVEMENT_RPC}/view`, {
      function: `${CHAINS[chain].pool}::ui_pool_data_provider_v3::get_reserves_data`,
      type_arguments: [],
      arguments: [],
    });

    const [reserves] = reservesData;

    return reserves.map((r) => {
      const assetPriceUsd = r.price_in_market_reference_currency / (10 ** 18);
      const assetDecimals = r.decimals;
      const availableLiquidity = r.available_liquidity / (10 ** assetDecimals);
      const totalBorrow = r.total_scaled_variable_debt / (10 ** assetDecimals);
      
      const liquidityUsd = availableLiquidity * assetPriceUsd;
      const totalBorrowUsd = totalBorrow * assetPriceUsd;
      const totalSupplyUsd = liquidityUsd + totalBorrowUsd;
      
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
        apyReward: 0,
        apyRewardBorrow: 0,
        underlyingTokens: [r.underlying_asset],
        rewardTokens: [],
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

    const priceLAB =
      chain !== 'manta'
        ? (
            await sdk.api.abi.call({
              target: PriceCalculator,
              abi: abiPriceCalculator.find((m) => m.name === 'priceOf'),
              params: [LAB],
              chain,
            })
          ).output
        : null;

    return allMarkets.map((p, i) => {
      const price = prices[`${chain}:${underlying[i]}`]?.price;
      const decimal = decimals[i] ?? 18;

      const totalSupplyUsd = (totalSupply[i] / 10 ** decimal) * price;
      const totalBorrowUsd = (totalBorrow[i] / 10 ** decimal) * price;
      const tvlUsd = totalSupplyUsd - totalBorrowUsd;

      const apyBase = (supplyRate[i] / 1e18) * 86400 * 365 * 100;
      const apyBaseBorrow = (borrowRate[i] / 1e18) * 86400 * 365 * 100;
      const underlyingTokens = [underlying[i]];
      const ltv = marketInfoOf[i].collateralFactor / 1e18;

      const apyReward =
        (((distributions[i].supplySpeed / 1e18) *
          86400 *
          365 *
          (priceLAB / 1e18)) /
          totalSupplyUsd) *
        100;

      const apyRewardBorrow =
        (((distributions[i].borrowSpeed / 1e18) *
          86400 *
          365 *
          (priceLAB / 1e18)) /
          totalBorrowUsd) *
        100;

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
