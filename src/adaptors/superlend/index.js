const sdk = require('@defillama/sdk');
const utils = require('../utils');

const {
  poolAbi,
  uiPoolDataProviderAbi,
  oracleAbi,
  CHAIN: chain,
  PROTOCOL_DATA_PROVIDER,
  UI_POOL_DATA_PROVIDER,
  PROVIDER_ADDRESS,
  CHAIN_ID,
  MERKLE_BASE_URL,
  CAMPAIGN_ID_MAP,
  APPLE_REWARD_TOKEN,
} = require('./constants');

const getApy = async () => {
  const reserveTokens = (
    await sdk.api.abi.call({
      target: PROTOCOL_DATA_PROVIDER,
      abi: poolAbi.find((m) => m.name === 'getAllReservesTokens'),
      chain,
    })
  ).output;

  const aTokens = (
    await sdk.api.abi.call({
      target: PROTOCOL_DATA_PROVIDER,
      abi: poolAbi.find((m) => m.name === 'getAllATokens'),
      chain,
    })
  ).output;

  const poolsReserveData = (
    await sdk.api.abi.multiCall({
      calls: reserveTokens.map((p) => ({
        target: PROTOCOL_DATA_PROVIDER,
        params: p.tokenAddress,
      })),
      abi: poolAbi.find((m) => m.name === 'getReserveData'),
      chain,
    })
  ).output.map((o) => o.output);

  const poolsReservesConfigurationData = (
    await sdk.api.abi.multiCall({
      calls: reserveTokens.map((p) => ({
        target: PROTOCOL_DATA_PROVIDER,
        params: p.tokenAddress,
      })),
      abi: poolAbi.find((m) => m.name === 'getReserveConfigurationData'),
      chain,
    })
  ).output.map((o) => o.output);

  const totalSupply = (
    await sdk.api.abi.multiCall({
      chain,
      abi: 'erc20:totalSupply',
      calls: aTokens.map((t) => ({
        target: t.tokenAddress,
      })),
    })
  ).output.map((o) => o.output);

  const underlyingBalances = (
    await sdk.api.abi.multiCall({
      chain,
      abi: 'erc20:balanceOf',
      calls: aTokens.map((t, i) => ({
        target: reserveTokens[i].tokenAddress,
        params: [t.tokenAddress],
      })),
    })
  ).output.map((o) => o.output);

  const underlyingDecimals = (
    await sdk.api.abi.multiCall({
      chain,
      abi: 'erc20:decimals',
      calls: aTokens.map((t) => ({
        target: t.tokenAddress,
      })),
    })
  ).output.map((o) => o.output);

  const oracleAddresses = (
    await sdk.api.abi.call({
      target: UI_POOL_DATA_PROVIDER,
      abi: uiPoolDataProviderAbi.find((m) => m.name === 'getReservesData'),
      params: PROVIDER_ADDRESS,
      chain,
    })
  ).output[0]?.reduce((acc, current) => {
    acc[current?.underlyingAsset.toLowerCase()] = current?.priceOracle;
    return acc;
  }, {});

  const oraclePrices = {};
  for (const key of Object.keys(oracleAddresses)) {
    oraclePrices[key] =
      Number(
        (
          await sdk.api.abi.call({
            target: oracleAddresses[key],
            abi: oracleAbi.find((m) => m.name === 'latestAnswer'),
            chain,
          })
        ).output
      ) / 1e8;
  }

  // reward data
  const rewardData = {};
  for (const pool of reserveTokens) {
    const campaignId = CAMPAIGN_ID_MAP[pool.symbol.toUpperCase()];
    const url = MERKLE_BASE_URL.replace('CHAIN_ID', CHAIN_ID).replace(
      'CAMPAIGN_ID',
      campaignId
    );
    const campaign = await utils.getData(url);
    rewardData[pool.symbol.toUpperCase()] = campaign[0]?.Opportunity?.apr ?? 0;
  }

  return reserveTokens
    .map((pool, i) => {
      const frozen = poolsReservesConfigurationData[i].isFrozen;
      if (frozen) return null;

      const p = poolsReserveData[i];
      const price = oraclePrices[pool.tokenAddress.toLowerCase()];

      const supply = totalSupply[i];
      let totalSupplyUsd = (supply / 10 ** underlyingDecimals[i]) * price;

      const currentSupply = underlyingBalances[i];
      let tvlUsd = (currentSupply / 10 ** underlyingDecimals[i]) * price;

      totalBorrowUsd = totalSupplyUsd - tvlUsd;

      const url = `https://markets.superlend.xyz/reserve-overview/?underlyingAsset=${pool.tokenAddress.toLowerCase()}&marketName=etherlink`;

      const apyBase = (p.liquidityRate / 10 ** 27) * 100;
      const apyReward = rewardData[pool.symbol.toUpperCase()] ?? 0;

      return {
        pool: `${aTokens[i].tokenAddress}-etlk`.toLowerCase(),
        chain: 'Etherlink',
        project: 'superlend',
        symbol: pool.symbol,
        tvlUsd,
        apyBase,
        apyReward,
        underlyingTokens: [pool.tokenAddress],
        rewardTokens: apyReward > 0 ? [APPLE_REWARD_TOKEN] : [],
        totalSupplyUsd,
        totalBorrowUsd,
        debtCeilingUsd: null,
        apyBaseBorrow: Number(p.variableBorrowRate) / 1e25,
        ltv: poolsReservesConfigurationData[i].ltv / 10000,
        url,
        borrowable: poolsReservesConfigurationData[i].borrowingEnabled,
        mintedCoin: null,
        poolMeta: null,
      };
    })
    .filter((i) => Boolean(i));
};

const keepFinite = (p) => {
  if (
    !['apyBase', 'apyReward', 'apy']
      .map((f) => Number.isFinite(p[f]))
      .includes(true)
  )
    return false;

  return Number.isFinite(p['tvlUsd']);
};

const apy = async () => {
  const pools = await getApy();

  return pools.filter((p) => keepFinite(p));
};

module.exports = {
  apy,
};
