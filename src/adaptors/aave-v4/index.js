const axios = require('axios');
const sdk = require('@defillama/sdk');
const utils = require('../utils');
const abi = require('./abi');

// Aave v4 keeps asset accounting and rates at the Hub, while borrow routes are
// constrained by Spoke-specific reserve configs. Hub rows expose the real
// supply/borrow asset state; `routing_reserve` rows expose only the Spoke route
// facts needed by downstream borrow routers and link back with `underlyingStateKey`.
const hubsByChain = {
  ethereum: {
    core: '0xCca852Bc40e560adC3b1Cc58CA5b55638ce826c9',
    plus: '0x06002e9c4412CB7814a791eA3666D905871E536A',
    prime: '0x943827DCA022D0F354a8a8c332dA1e5Eb9f9F931',
  },
  avax: {
    core: '0xd07369fAE4A5BB13c9Ce446B052c7867B1AbDf6e',
  },
};

const spokeNamesByChain = {
  ethereum: {
    '0x973a023a77420ba610f06b3858ad991df6d85a08': 'Bluechip',
    '0x58131e79531cab1d52301228d1f7b842f26b9649': 'Ethena Correlated',
    '0xba1b3d55d249692b669a164024a838309b7508af': 'Ethena Ecosystem',
    '0xbf10bdfe177de0336afd7fccf80a904e15386219': 'Etherfi',
    '0xd8b93635b8c6d0ff98cbe90b5988e3f2d1cd9da1': 'Forex',
    '0x65407b940966954b23dfa3caa5c0702bb42984dc': 'Gold',
    '0x3131fe68c4722e726fe6b2819ed68e514395b9a4': 'Kelp',
    '0xe1900480ac69f0b296841cd01cc37546d92f35cd': 'Lido',
    '0x7ec68b5695e803e98a21a9a05d744f28b0a7753d': 'Lombard',
    '0x94e7a5dcbe816e498b89ab752661904e2f56c485': 'Main',
  },
  avax: {
    '0x435272ceff93a1e657e8abfdf0a13e95900a3a56': 'Main',
    '0x6a37776b5e026dbdf043b4f933c323c84dd1b514': 'Forex',
    '0x3b517594277c67307cf2d7cbe6fe1d4399b68c41': 'AVAX Correlated',
  },
};

const toNumber = (value) => Number(value ?? 0);
const scale = (value, decimals) => toNumber(value) / 10 ** Number(decimals);
const getAssetKey = (hub, assetId) => `${hub.toLowerCase()}:${assetId}`;
const getReserveKey = (hub, assetId, spoke) =>
  `${getAssetKey(hub, assetId)}:${spoke.toLowerCase()}`;
const formatPoolMeta = (value) =>
  value ? value.charAt(0).toUpperCase() + value.slice(1) : value;
const isUncapped = (cap, maxCap) => toNumber(cap) >= toNumber(maxCap);
const isReserveActive = (reserve) =>
  reserve.spokeConfig.active &&
  !reserve.spokeConfig.halted &&
  !reserve.reserveConfig.paused &&
  !reserve.reserveConfig.frozen;

const getSpokeCalls = (assetCalls, spokeCounts) =>
  assetCalls.flatMap((asset, i) =>
    Array.from({ length: Number(spokeCounts[i]) }, (_, spokeIndex) => ({
      ...asset,
      spokeIndex,
      call: {
        target: asset.hub,
        params: [asset.assetId, spokeIndex],
      },
    }))
  );

const getReserveDetails = async (api, spokeEntries) => {
  if (!spokeEntries.length) return {};

  const [spokeConfigs, reserveIds, spokeTotalOwed] = await Promise.all([
    api.multiCall({
      abi: abi.getSpokeConfig,
      calls: spokeEntries.map((entry) => ({
        target: entry.hub,
        params: [entry.assetId, entry.spoke],
      })),
    }),
    api.multiCall({
      abi: abi.getReserveId,
      calls: spokeEntries.map((entry) => ({
        target: entry.spoke,
        params: [entry.hub, entry.assetId],
      })),
      permitFailure: true,
    }),
    api.multiCall({
      abi: abi.getSpokeTotalOwed,
      calls: spokeEntries.map((entry) => ({
        target: entry.hub,
        params: [entry.assetId, entry.spoke],
      })),
    }),
  ]);

  const reserveEntries = spokeEntries
    .map((entry, i) => ({
      ...entry,
      reserveId: reserveIds[i],
      spokeConfig: spokeConfigs[i],
      spokeTotalOwed: spokeTotalOwed[i],
    }))
    .filter((entry) => entry.reserveId != null);

  if (!reserveEntries.length) return {};

  const [reserves, reserveConfigs] = await Promise.all([
    api.multiCall({
      abi: abi.getReserve,
      calls: reserveEntries.map((entry) => ({
        target: entry.spoke,
        params: [entry.reserveId],
      })),
    }),
    api.multiCall({
      abi: abi.getReserveConfig,
      calls: reserveEntries.map((entry) => ({
        target: entry.spoke,
        params: [entry.reserveId],
      })),
    }),
  ]);

  const dynamicConfigs = await api.multiCall({
    abi: abi.getDynamicReserveConfig,
    calls: reserveEntries.map((entry, i) => ({
      target: entry.spoke,
      params: [entry.reserveId, reserves[i].dynamicConfigKey],
    })),
  });

  return reserveEntries.reduce((acc, entry, i) => {
    acc[getReserveKey(entry.hub, entry.assetId, entry.spoke)] = {
      ...entry,
      reserve: reserves[i],
      reserveConfig: reserveConfigs[i],
      dynamicConfig: dynamicConfigs[i],
    };
    return acc;
  }, {});
};

const getReserveAvailableBorrowUsd = ({
  reserve,
  tvlUsd,
  price,
  decimals,
  maxSpokeCap,
}) => {
  if (
    !reserve.reserveConfig.borrowable ||
    toNumber(reserve.spokeConfig.drawCap) <= 0
  ) {
    return 0;
  }

  if (isUncapped(reserve.spokeConfig.drawCap, maxSpokeCap)) {
    return tvlUsd;
  }

  const drawCap = toNumber(reserve.spokeConfig.drawCap);
  const borrowed = scale(reserve.spokeTotalOwed, decimals);
  return Math.max(Math.min(tvlUsd, (drawCap - borrowed) * price), 0);
};

const getAssetAvailableBorrowUsd = ({ reserves, ...asset }) =>
  Math.min(
    asset.tvlUsd,
    reserves
      .filter(isReserveActive)
      .reduce(
        (sum, reserve) =>
          sum + getReserveAvailableBorrowUsd({ reserve, ...asset }),
        0
      )
  );

const getApy = async (chain) => {
  const hubs = hubsByChain[chain];
  const chainLabel = chain === 'avax' ? 'avalanche' : chain;
  const api = new sdk.ChainApi({ chain });

  const hubEntries = Object.entries(hubs);
  const hubAddresses = hubEntries.map(([, addr]) => addr);

  const [assetCounts, maxSpokeCaps] = await Promise.all([
    api.multiCall({
      abi: abi.getAssetCount,
      calls: hubAddresses,
    }),
    api.multiCall({
      abi: abi.maxAllowedSpokeCap,
      calls: hubAddresses,
    }),
  ]);

  const allCalls = hubEntries.flatMap(([name, hub], i) =>
    Array.from({ length: Number(assetCounts[i]) }, (_, assetId) => ({
      name,
      hub,
      hubIndex: i,
      assetId,
      call: { target: hub, params: [assetId] },
    }))
  );
  const calls = allCalls.map((c) => c.call);

  const [underlyings, drawnRates, addedAssets, totalOwed, assets, spokeCounts] =
    await Promise.all([
      api.multiCall({ abi: abi.getAssetUnderlyingAndDecimals, calls }),
      api.multiCall({ abi: abi.getAssetDrawnRate, calls }),
      api.multiCall({ abi: abi.getAddedAssets, calls }),
      api.multiCall({ abi: abi.getAssetTotalOwed, calls }),
      api.multiCall({ abi: abi.getAsset, calls }),
      api.multiCall({ abi: abi.getSpokeCount, calls }),
    ]);

  const spokeCalls = getSpokeCalls(allCalls, spokeCounts);
  const spokeAddresses = spokeCalls.length
    ? await api.multiCall({
        abi: abi.getSpokeAddress,
        calls: spokeCalls.map((entry) => entry.call),
      })
    : [];
  const spokeEntries = spokeCalls.map((entry, i) => ({
    ...entry,
    spoke: spokeAddresses[i],
  }));
  const reservesBySpoke = await getReserveDetails(api, spokeEntries);

  const uniqueTokens = [
    ...new Set(underlyings.map(([addr]) => addr.toLowerCase())),
  ];
  const priceKeys = uniqueTokens.map((t) => `${chain}:${t}`).join(',');

  const [balances, tokenSymbols, pricesRes] = await Promise.all([
    api.multiCall({
      abi: 'erc20:balanceOf',
      calls: allCalls.map((c, i) => ({
        target: underlyings[i][0],
        params: [c.hub],
      })),
    }),
    api.multiCall({
      abi: 'erc20:symbol',
      calls: allCalls.map((c, i) => underlyings[i][0]),
      permitFailure: true,
    }),
    axios.get(utils.getPriceApiUrl(`/prices/current/${priceKeys}`)),
  ]);
  const prices = pricesRes.data.coins;

  const chainId = api.chainId;
  const assetsByKey = {};

  const aggregatePools = allCalls
    .map((c, i) => {
      const [underlying, decStr] = underlyings[i];
      const decimals = Number(decStr);
      const priceKey = `${chain}:${underlying.toLowerCase()}`;
      const price = prices[priceKey]?.price;
      const symbol = tokenSymbols[i] || prices[priceKey]?.symbol;
      if (!price || !symbol) return null;

      const totalAdded = Number(addedAssets[i]) / 10 ** decimals;
      const totalBorrow = Number(totalOwed[i]) / 10 ** decimals;
      const balance = Number(balances[i]) / 10 ** decimals;
      const liquidityFee = Number(assets[i].liquidityFee);

      const totalSupplyUsd = totalAdded * price;
      const totalBorrowUsd = totalBorrow * price;
      const tvlUsd = balance * price;

      const apyBaseBorrow = (Number(drawnRates[i]) / 1e27) * 100;

      const utilization = totalAdded > 0 ? totalBorrow / totalAdded : 0;
      const apyBase =
        apyBaseBorrow * utilization * (1 - liquidityFee / 10000);

      const underlyingStateKey = getAssetKey(c.hub, c.assetId);
      const availableBorrowUsd = getAssetAvailableBorrowUsd({
        reserves: Object.entries(reservesBySpoke)
          .filter(([key]) => key.startsWith(`${underlyingStateKey}:`))
          .map(([, reserve]) => reserve),
        tvlUsd,
        price,
        decimals,
        maxSpokeCap: maxSpokeCaps[c.hubIndex],
      });
      const pool = {
        pool: `${c.hub}-${c.assetId}-${chainLabel}`.toLowerCase(),
        chain: utils.formatChain(chainLabel),
        project: 'aave-v4',
        symbol: symbol,
        underlyingStateKey,
        tvlUsd,
        apyBase,
        underlyingTokens: [underlying],
        token: null,
        totalSupplyUsd,
        totalBorrowUsd,
        availableBorrowUsd,
        apyBaseBorrow,
        borrowToken: underlying,
        url: `https://pro.aave.com/explore/asset/${chainId}/${underlying}`,
        poolMeta: formatPoolMeta(c.name),
      };

      assetsByKey[underlyingStateKey] = {
        ...pool,
        underlying,
        decimals,
        price,
        tvlUsd,
        totalSupplyUsd,
        apyBase,
        apyBaseBorrow,
        maxSpokeCap: maxSpokeCaps[c.hubIndex],
      };

      return pool;
    })
    .filter(Boolean);

  const reservePools = spokeEntries
    .map((entry) => {
      const asset = assetsByKey[getAssetKey(entry.hub, entry.assetId)];
      const reserve =
        reservesBySpoke[getReserveKey(entry.hub, entry.assetId, entry.spoke)];
      if (!asset || !reserve) return null;

      const active = isReserveActive(reserve);
      const ltv =
        active && reserve.reserveConfig.receiveSharesEnabled
          ? toNumber(reserve.dynamicConfig.collateralFactor) / 10000
          : 0;
      const totalBorrowUsd =
        scale(reserve.spokeTotalOwed, asset.decimals) * asset.price;
      const availableBorrowUsd = active
        ? getReserveAvailableBorrowUsd({ reserve, ...asset })
        : 0;
      const borrowable =
        active &&
        reserve.reserveConfig.borrowable &&
        toNumber(reserve.spokeConfig.drawCap) > 0;
      const spokeName =
        spokeNamesByChain[chain]?.[entry.spoke.toLowerCase()] ||
        entry.spoke.slice(0, 6);
      const underlyingStateKey = getAssetKey(entry.hub, entry.assetId);
      const pool = {
        pool:
          `${entry.spoke}-${entry.hub}-${entry.assetId}-${chainLabel}`.toLowerCase(),
        chain: asset.chain,
        project: 'aave-v4',
        symbol: asset.symbol,
        underlyingStateKey,
        underlyingTokens: [asset.underlying],
        token: null,
        poolKind: 'routing_reserve',
        ltv,
        borrowable,
        routeGroupKey: entry.spoke.toLowerCase(),
        url: asset.url,
        poolMeta: `${asset.poolMeta} / ${spokeName}`,
      };

      if (borrowable) {
        pool.totalBorrowUsd = totalBorrowUsd;
        pool.availableBorrowUsd = availableBorrowUsd;
        pool.borrowToken = asset.underlying;
      }

      return pool;
    })
    .filter(Boolean);

  return [...aggregatePools, ...reservePools];
};

const apy = async () => {
  const pools = await Promise.allSettled(
    Object.keys(hubsByChain).map((chain) => getApy(chain))
  );

  return pools
    .filter((i) => i.status === 'fulfilled')
    .map((i) => i.value)
    .flat()
    .filter((p) => p.poolKind === 'routing_reserve' || utils.keepFinite(p));
};

module.exports = {
  protocolId: '7594',
  timetravel: false,
  apy,
};
