// Copied from aave v3
const axios = require('axios');
const sdk = require('@defillama/sdk');

const utils = require('../utils');
const { aTokenAbi } = require('../aave-v3/abi');
const poolAbi = require('../aave-v3/poolAbi');
const abiSKYFarm = require('./abiSKYFarm.json');

const sparkChains = ['ethereum', 'gnosis'];

/**
 * protocol data provider address per chain
 * @type {{ethereum: string, gnosis: string}}
 */
const protocolDataProviderAddress = {
  ethereum: '0xFc21d6d146E6086B8359705C8b28512a983db0cb',
  gnosis: '0x2a002054A06546bB5a264D57A81347e23Af91D18',
};

/**
 * Fetches the Spark V3 pools
 * @param {('ethereum'|'gnosis')} chain
 */
async function fetchV3Pools(chain) {
  const target = protocolDataProviderAddress[chain];

  chain = chain === 'gnosis' ? 'xdai' : chain; // llamas sdk uses xdai instead of gnosis

  const reserveTokens = (
    await sdk.api.abi.call({
      target,
      abi: poolAbi.find((m) => m.name === 'getAllReservesTokens'),
      chain,
    })
  ).output;

  const aTokens = (
    await sdk.api.abi.call({
      target,
      abi: poolAbi.find((m) => m.name === 'getAllATokens'),
      chain,
    })
  ).output;

  const poolsReserveData = (
    await sdk.api.abi.multiCall({
      calls: reserveTokens.map((p) => ({
        target,
        params: p.tokenAddress,
      })),
      abi: poolAbi.find((m) => m.name === 'getReserveData'),
      chain,
    })
  ).output.map((o) => o.output);

  const poolsReservesConfigurationData = (
    await sdk.api.abi.multiCall({
      calls: reserveTokens.map((p) => ({
        target,
        params: p.tokenAddress,
      })),
      abi: poolAbi.find((m) => m.name === 'getReserveConfigurationData'),
      chain,
    })
  ).output.map((o) => o.output);

  const reserveCaps = (
    await sdk.api.abi.multiCall({
      calls: reserveTokens.map((p) => ({
        target,
        params: p.tokenAddress,
      })),
      abi: poolAbi.find((m) => m.name === 'getReserveCaps'),
      chain,
    })
  ).output.map((o) => o.output);

  const totalSupplyEthereum = (
    await sdk.api.abi.multiCall({
      chain,
      abi: aTokenAbi.find(({ name }) => name === 'totalSupply'),
      calls: aTokens.map((t) => ({
        target: t.tokenAddress,
      })),
    })
  ).output.map((o) => o.output);

  const underlyingBalancesEthereum = (
    await sdk.api.abi.multiCall({
      chain,
      abi: aTokenAbi.find(({ name }) => name === 'balanceOf'),
      calls: aTokens.map((t, i) => ({
        target: reserveTokens[i].tokenAddress,
        params: [t.tokenAddress],
      })),
    })
  ).output.map((o) => o.output);

  const underlyingDecimalsEthereum = (
    await sdk.api.abi.multiCall({
      chain,
      abi: aTokenAbi.find(({ name }) => name === 'decimals'),
      calls: aTokens.map((t) => ({
        target: t.tokenAddress,
      })),
    })
  ).output.map((o) => o.output);

  const priceKeys = reserveTokens
    .map((t) => `${chain}:${t.tokenAddress}`)
    .join(',');
  const pricesEthereum = (await utils.getPriceApiData(`/prices/current/${priceKeys}`)).coins;

  return reserveTokens
    .map((pool, i) => {
      const p = poolsReserveData[i];
      const config = poolsReservesConfigurationData[i];
      if (config.isFrozen) return null;

      const decimals = BigInt(underlyingDecimalsEthereum[i]);
      const borrowCap = BigInt(reserveCaps[i].borrowCap);
      const borrowCapReached =
        borrowCap > 0n &&
        BigInt(p.totalStableDebt) + BigInt(p.totalVariableDebt) >=
          borrowCap * 10n ** decimals;
      const price = pricesEthereum[`${chain}:${pool.tokenAddress}`]?.price;

      const supply = totalSupplyEthereum[i];
      const totalSupplyUsd =
        (supply / 10 ** underlyingDecimalsEthereum[i]) * price;

      const currentSupply = underlyingBalancesEthereum[i];
      const tvlUsd =
        (currentSupply / 10 ** underlyingDecimalsEthereum[i]) * price;

      const totalBorrowUsd =
        ((Number(p.totalStableDebt) + Number(p.totalVariableDebt)) /
          10 ** underlyingDecimalsEthereum[i]) *
        price;
      const borrowCapUsd = Number(reserveCaps[i].borrowCap) * price;
      const availableBorrowUsd = borrowCap > 0n
        ? Math.max(Math.min(tvlUsd, borrowCapUsd - totalBorrowUsd), 0)
        : tvlUsd;
      // Omit borrow fields when Spark disables borrowing; cap-reached markets
      // still expose borrow data but are marked as not borrowable.
      const hasBorrowSide = config.borrowingEnabled && config.isActive;
      const borrowable = hasBorrowSide && !borrowCapReached;
      const sparkChainId = chain === 'xdai' ? 100 : 1;

      return {
        pool: `${aTokens[i].tokenAddress}-${chain}`.toLowerCase(),
        // Captialize the first letter of the chain
        chain: chain === 'xdai' ? 'Gnosis' : 'Ethereum',
        project: 'sparklend',
        symbol: pool.symbol,
        tvlUsd,
        apyBase: (p.liquidityRate / 10 ** 27) * 100,
        underlyingTokens: [pool.tokenAddress],
        totalSupplyUsd,
        ...(hasBorrowSide && {
          totalBorrowUsd,
          availableBorrowUsd,
          apyBaseBorrow: Number(p.variableBorrowRate) / 1e25,
          borrowToken: pool.tokenAddress,
        }),
        ltv: config.ltv / 10000,
        borrowable,
        url: `https://app.spark.fi/markets/${sparkChainId}/${pool.tokenAddress}`,
      };
    })
    .filter(Boolean)
    .filter((p) => utils.keepFinite(p));
}

const spkFarm = async () => {
  const stakingRewards = '0x173e314C7635B45322cd8Cb14f44b312e079F3af';
  const USDS = '0xdC035D45d973E3EC169d2276DDab16f1e407384F';
  const SPK = '0xc20059e0317DE91738d13af027DfC4a50781b066';

  const [totalSupplyRes, stakingTokenRes, rewardRateRes, periodFinishRes] =
    await Promise.all([
      sdk.api.abi.call({
        target: stakingRewards,
        abi: 'erc20:totalSupply',
      }),
      sdk.api.abi.call({
        target: stakingRewards,
        abi: abiSKYFarm.find((m) => m.name === 'stakingToken'),
      }),
      sdk.api.abi.call({
        target: stakingRewards,
        abi: abiSKYFarm.find((m) => m.name === 'rewardRate'),
      }),
      sdk.api.abi.call({
        target: stakingRewards,
        abi: abiSKYFarm.find((m) => m.name === 'periodFinish'),
      }),
    ]);

  const totalSupply = totalSupplyRes.output / 1e18;
  const stakingToken = stakingTokenRes.output;
  const rewardRate = rewardRateRes.output / 1e18;
  const periodFinish = Number(periodFinishRes.output);

  const prices = await axios.get(
    utils.getPriceApiUrl(`/prices/current/${[USDS, SPK]
      .map((i) => `ethereum:${i}`)
      .join(',')}`)
  );

  const priceUSDS = prices.data.coins[`ethereum:${USDS}`].price;
  const priceSPK = prices.data.coins[`ethereum:${SPK}`].price;

  const tvlUsd = totalSupply * priceUSDS;

  const isActive = Date.now() / 1000 < periodFinish;
  const secPerDay = 86400;
  const apyReward = isActive
    ? ((rewardRate * secPerDay * 365 * priceSPK) / tvlUsd) * 100
    : 0;

  return [
    {
      pool: stakingRewards,
      chain: 'Ethereum',
      project: 'sparklend',
      symbol: 'USDS',
      token: stakingRewards,
      poolMeta: 'SPK Farming Pool',
      tvlUsd,
      apyReward,
      underlyingTokens: [stakingToken],
      rewardTokens: [SPK],
      url: 'https://app.spark.fi/spk/farm',
    },
  ];
};

const apy = async () => {
  const spkFarmPool = await spkFarm();

  const v3Pools = [
    ...(await Promise.all(sparkChains.map(fetchV3Pools))),
  ].flat();

  return [...v3Pools, ...spkFarmPool];
};

module.exports = {
  protocolId: '2929',
  timetravel: false,
  apy: apy,
  url: 'https://app.spark.fi/markets/',
};
