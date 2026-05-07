const axios = require('axios');
const sdk = require('@defillama/sdk');
const utils = require('../utils');
const abi = require('./abi');

const hubsByChain = {
  ethereum: {
    core: '0xCca852Bc40e560adC3b1Cc58CA5b55638ce826c9',
    plus: '0x06002e9c4412CB7814a791eA3666D905871E536A',
    prime: '0x943827DCA022D0F354a8a8c332dA1e5Eb9f9F931',
  },
};

const getApy = async (chain) => {
  const hubs = hubsByChain[chain];
  const api = new sdk.ChainApi({ chain });

  const hubEntries = Object.entries(hubs);
  const hubAddresses = hubEntries.map(([, addr]) => addr);

  const assetCounts = await api.multiCall({
    abi: abi.getAssetCount,
    calls: hubAddresses,
  });

  const allCalls = hubEntries.flatMap(([name, hub], i) =>
    Array.from({ length: assetCounts[i] }, (_, assetId) => ({
      name,
      hub,
      assetId,
      call: { target: hub, params: [assetId] },
    }))
  );
  const calls = allCalls.map((c) => c.call);

  const [underlyings, drawnRates, addedAssets, totalOwed, assets] =
    await Promise.all([
      api.multiCall({ abi: abi.getAssetUnderlyingAndDecimals, calls }),
      api.multiCall({ abi: abi.getAssetDrawnRate, calls }),
      api.multiCall({ abi: abi.getAddedAssets, calls }),
      api.multiCall({ abi: abi.getAssetTotalOwed, calls }),
      api.multiCall({ abi: abi.getAsset, calls }),
    ]);

  const uniqueTokens = [
    ...new Set(underlyings.map(([addr]) => addr.toLowerCase())),
  ];
  const priceKeys = uniqueTokens.map((t) => `${chain}:${t}`).join(',');

  const [balances, pricesRes] = await Promise.all([
    api.multiCall({
      abi: 'erc20:balanceOf',
      calls: allCalls.map((c, i) => ({
        target: underlyings[i][0],
        params: [c.hub],
      })),
    }),
    axios.get(`https://coins.llama.fi/prices/current/${priceKeys}`),
  ]);
  const prices = pricesRes.data.coins;

  const chainId = api.chainId;

  return allCalls
    .map((c, i) => {
      const [underlying, decStr] = underlyings[i];
      const decimals = Number(decStr);
      const priceKey = `${chain}:${underlying.toLowerCase()}`;
      const price = prices[priceKey]?.price;
      const symbol = prices[priceKey]?.symbol;
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

      return {
        pool: `${c.hub}-${c.assetId}-${chain}`.toLowerCase(),
        chain: utils.formatChain(chain),
        project: 'aave-v4',
        symbol: utils.formatSymbol(symbol),
        tvlUsd,
        apyBase,
        underlyingTokens: [underlying],
        token: null,
        totalSupplyUsd,
        totalBorrowUsd,
        apyBaseBorrow,
        url: `https://pro.aave.com/explore/asset/${chainId}/${underlying}`,
        poolMeta: c.name,
      };
    })
    .filter(Boolean);
};

const apy = async () => {
  const pools = await Promise.allSettled(
    Object.keys(hubsByChain).map((chain) => getApy(chain))
  );

  return pools
    .filter((i) => i.status === 'fulfilled')
    .map((i) => i.value)
    .flat()
    .filter((p) => utils.keepFinite(p));
};

module.exports = {
  timetravel: false,
  apy,
};
