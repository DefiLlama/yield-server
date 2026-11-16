const sdk = require('@defillama/sdk');

const aaveV3PoolAbi = require('../aave-v3/poolAbi');
const utils = require('../utils');

// LayerBank V3 deployments, keyed by DefiLlama SDK chain id.
const LAYERBANK_V3_CHAINS = {
  // Rootstock
  rsk: {
    protocolDataProvider: '0x47C1ef207d49cfC519F48b8251857CA6BE6c2caf',
  },
  robinhood: {
    protocolDataProvider: '0x7ED03A856D52172f9501aB0176f184baD287e546',
  },
};

const apyLayerBankV3 = async (chain) => {
  const { protocolDataProvider } = LAYERBANK_V3_CHAINS[chain];
  const findAbi = (name) => aaveV3PoolAbi.find((m) => m.name === name);
  const perReserveCall = (reserveTokens) =>
    reserveTokens.map((t) => ({
      target: protocolDataProvider,
      params: t.tokenAddress,
    }));

  const [reserveTokens, aTokens] = await Promise.all([
    sdk.api.abi.call({
      target: protocolDataProvider,
      abi: findAbi('getAllReservesTokens'),
      chain,
    }),
    sdk.api.abi.call({
      target: protocolDataProvider,
      abi: findAbi('getAllATokens'),
      chain,
    }),
  ]).then((responses) => responses.map((r) => r.output));

  const [reserveData, reserveConfig, reserveCaps, paused, totalSupply, cash] =
    await Promise.all([
      sdk.api.abi.multiCall({
        calls: perReserveCall(reserveTokens),
        abi: findAbi('getReserveData'),
        chain,
      }),
      sdk.api.abi.multiCall({
        calls: perReserveCall(reserveTokens),
        abi: findAbi('getReserveConfigurationData'),
        chain,
      }),
      sdk.api.abi.multiCall({
        calls: perReserveCall(reserveTokens),
        abi: findAbi('getReserveCaps'),
        chain,
      }),
      sdk.api.abi.multiCall({
        calls: perReserveCall(reserveTokens),
        abi: findAbi('getPaused'),
        chain,
      }),
      sdk.api.abi.multiCall({
        chain,
        abi: 'erc20:totalSupply',
        calls: aTokens.map((t) => ({ target: t.tokenAddress })),
      }),
      sdk.api.abi.multiCall({
        chain,
        abi: 'erc20:balanceOf',
        calls: aTokens.map((t, i) => ({
          target: reserveTokens[i].tokenAddress,
          params: [t.tokenAddress],
        })),
      }),
    ]).then((responses) => responses.map((r) => r.output.map((o) => o.output)));

  const priceKeys = reserveTokens
    .map((t) => `${chain}:${t.tokenAddress}`)
    .join(',');
  const prices = (await utils.getPriceApiData(`/prices/current/${priceKeys}`))
    .coins;

  return reserveTokens
    .map((reserve, i) => {
      const config = reserveConfig[i];
      if (!config.isActive || paused[i]) return null;

      const price = prices[`${chain}:${reserve.tokenAddress}`]?.price;
      const decimals = Number(config.decimals);
      const data = reserveData[i];

      const totalSupplyUsd = (totalSupply[i] / 10 ** decimals) * price;
      const liquidityUsd = (cash[i] / 10 ** decimals) * price;
      const totalBorrowUsd =
        ((Number(data.totalStableDebt) + Number(data.totalVariableDebt)) /
          10 ** decimals) *
        price;

      const borrowCap = Number(reserveCaps[i].borrowCap);
      const supplyCap = Number(reserveCaps[i].supplyCap);
      const borrowCapUsd = borrowCap * price;
      const availableBorrowUsd = !config.borrowingEnabled
        ? 0
        : borrowCap > 0
        ? Math.max(Math.min(liquidityUsd, borrowCapUsd - totalBorrowUsd), 0)
        : liquidityUsd;

      return {
        pool: `${aTokens[i].tokenAddress.toLowerCase()}-${chain}`,
        chain,
        project: 'layerbank',
        symbol: reserve.symbol,
        tvlUsd: liquidityUsd,
        totalSupplyUsd,
        ...(supplyCap > 0 && { supplyCapUsd: supplyCap * price }),
        totalBorrowUsd,
        availableBorrowUsd,
        apyBase: (data.liquidityRate / 1e27) * 100,
        apyBaseBorrow: Number(data.variableBorrowRate) / 1e25,
        borrowToken: reserve.tokenAddress,
        underlyingTokens: [reserve.tokenAddress],
        ltv: config.ltv / 10000,
        borrowable: config.borrowingEnabled,
        frozen: config.isFrozen,
      };
    })
    .filter(Boolean);
};

const main = async () => {
  const pools = await Promise.all(
    Object.keys(LAYERBANK_V3_CHAINS).map((chain) => apyLayerBankV3(chain))
  );
  return pools.flat().filter((i) => utils.keepFinite(i));
};

module.exports = {
  protocolId: '3250',
  apy: main,
  url: 'https://app.layerbank.finance',
};
