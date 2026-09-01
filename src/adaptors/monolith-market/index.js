const sdk = require('@defillama/sdk');
const utils = require('../utils');
const lensAbi = require('./lensAbi');
const lenderAbi = require('./lenderAbi');
const vaultAbi = require('./vaultAbi');

const PROJECT = 'monolith-market';

const FACTORIES = {
  ethereum: { chainId: 1, blocksPerYear: 2609750, factory: '0x6D961c9DCF1AD73566822BA4B087892e3839B849', lens: '0x0f3a7cd1828698D2B6daEf081d5c319c0734fA1c', fromBlock: 24949282 },
}

const simpleCalls = (arr, params) => {
  return arr.map(a => ({ target: a, params, permitFailure: true }))
}

async function getChainPools(chain) {
  const latestBlock = await sdk.api.util.getLatestBlock(chain);

  const toBlock = latestBlock.number;

  const { factory, chainId, lens, blocksPerYear, fromBlock } = FACTORIES[chain];

  const logs = await sdk.getEventLogs({
    target: factory,
    fromBlock,
    toBlock,
    chain,
    eventAbi: 'event Deployed(address indexed lender, address indexed coin, address indexed vault)',
  });

  const lenders = logs.map(l => l.args.lender);
  const coins = logs.map(l => l.args.coin);
  const vaults = logs.map(l => l.args.vault);

  const [
    vaultAssets,
    syncedTotalDebts,
    collaterals,
  ] = (await Promise.all([
    sdk.api.abi.multiCall({ chain, abi: vaultAbi.find(a => a.name === 'totalAssets'), calls: simpleCalls(vaults) }),
    sdk.api.abi.multiCall({
      chain, abi: lensAbi.find(a => a.name === 'getSyncedTotalDebts'), calls: lenders.map(lender => {
        return {
          target: lens,
          params: [lender],
          permitFailure: true,
        }
      })
    }),
    sdk.api.abi.multiCall({ chain, abi: lenderAbi.find(a => a.name === 'collateral'), calls: simpleCalls(lenders) }),
  ])).map(r => r.output.map(o => o.output));

  const collateralDeposits = (await sdk.api.abi.multiCall({
    chain, abi: 'erc20:balanceOf', calls: collaterals.map((col,i) => {
      return {
        target: col,
        params: [lenders[i]],
        permitFailure: true,
      }
    })
  })).output.map(o => o.output);

  const cdpMarketIndexes = lenders
    .map((_, i) => i)
    .filter((i) => Number(collateralDeposits[i]) > 0 || Number(syncedTotalDebts[i].syncedTotalDebt) > 0);
  const savingsMarketIndexes = lenders
    .map((_, i) => i)
    .filter((i) => Number(vaultAssets[i]) > 0);
  const activeMarketIndexes = [
    ...new Set(cdpMarketIndexes.concat(savingsMarketIndexes)),
  ];

  if (!activeMarketIndexes.length) return [];

  const activeCalls = activeMarketIndexes.map((i) => ({
    target: lenders[i],
    permitFailure: true,
  }));
  const activeLensCalls = activeMarketIndexes.map((i) => ({
    target: lens,
    params: [lenders[i]],
    permitFailure: true,
  }));
  const activeVaultCalls = activeMarketIndexes.map((i) => ({
    target: vaults[i],
    permitFailure: true,
  }));
  const activeCoinCalls = activeMarketIndexes.map((i) => ({
    target: coins[i],
    permitFailure: true,
  }));
  const activeCollateralCalls = activeMarketIndexes.map((i) => ({
    target: collaterals[i],
    permitFailure: true,
  }));

  const [
    rates,
    vaultSymbols,
    coinSymbols,
    collateralFactors,
    collateralsPriceData,
    collateralSymbols,
    collateralDecimals,
    pricesData,
  ] = await Promise.all([
    sdk.api.abi.multiCall({ chain, abi: lensAbi.find(a => a.name === 'getRates'), calls: activeLensCalls }),
    sdk.api.abi.multiCall({ chain, abi: 'erc20:symbol', calls: activeVaultCalls }),
    sdk.api.abi.multiCall({ chain, abi: 'erc20:symbol', calls: activeCoinCalls }),
    sdk.api.abi.multiCall({ chain, abi: lenderAbi.find(a => a.name === 'collateralFactor'), calls: activeCalls }),
    sdk.api.abi.multiCall({ chain, abi: lenderAbi.find(a => a.name === 'getCollateralPrice'), calls: activeCalls }),
    sdk.api.abi.multiCall({ chain, abi: 'erc20:symbol', calls: activeCollateralCalls }),
    sdk.api.abi.multiCall({ chain, abi: 'erc20:decimals', calls: activeCollateralCalls }),
    utils.getPrices(
      [
        ...new Set(
          cdpMarketIndexes
            .flatMap((i) => [coins[i], collaterals[i]])
            .concat(savingsMarketIndexes.map((i) => coins[i]))
        ),
      ],
      chain
    ),
  ]);

  const byMarketIndex = (values) =>
    Object.fromEntries(activeMarketIndexes.map((i, j) => [i, values[j]]));
  const ratesByIndex = byMarketIndex(rates.output.map(o => o.output));
  const vaultSymbolsByIndex = byMarketIndex(vaultSymbols.output.map(o => o.output));
  const coinSymbolsByIndex = byMarketIndex(coinSymbols.output.map(o => o.output));
  const collateralFactorsByIndex = byMarketIndex(collateralFactors.output.map(o => o.output));
  const collateralsPriceDataByIndex = byMarketIndex(collateralsPriceData.output.map(o => o.output));
  const collateralSymbolsByIndex = byMarketIndex(collateralSymbols.output.map(o => o.output));
  const collateralDecimalsByIndex = byMarketIndex(collateralDecimals.output.map(o => o.output));

  const { pricesByAddress } = pricesData;

  // CDP markets, where coins are minted against collaterals
  const cdpMarkets = cdpMarketIndexes.map((marketIndex) => {
    const m = lenders[marketIndex];
    const collateral = collaterals[marketIndex];
    const collateralSymbol = collateralSymbolsByIndex[marketIndex];
    const collateralDecimal = collateralDecimalsByIndex[marketIndex];
    const mintedCoin = coinSymbolsByIndex[marketIndex];
    
    const coin = coins[marketIndex];
    const coinPriceUsd = pricesByAddress[coin.toLowerCase()] || 0;
    
    const { price: oraclePrice, reduceOnly } = collateralsPriceDataByIndex[marketIndex];
    const oraclePriceUsd = (Number(oraclePrice) / (10 ** (36 - collateralDecimal))) || 0;
    // use defillama if available otherwise fallback to oracle price
    const collateralPriceUsd = pricesByAddress[collateral.toLowerCase()] || oraclePriceUsd;
    const totalSupplyUsd = collateralPriceUsd * Number(collateralDeposits[marketIndex]) / (10 ** collateralDecimal)
    const totalBorrowUsd = coinPriceUsd * Number(syncedTotalDebts[marketIndex].syncedTotalDebt) / 1e18;
    const borrowApr = Math.min(Number(ratesByIndex[marketIndex][0]) / 1e16, 999_999_999);
    const borrowApy = borrowApr < 999_999_999 ? Math.min(999_999_999, utils.aprToApy(borrowApr, blocksPerYear)) : 999_999_999;
    const ltv = Number(collateralFactorsByIndex[marketIndex]) / 1e4;
    const availableBorrowUsd = reduceOnly
      ? 0
      : Math.max(totalSupplyUsd * ltv - totalBorrowUsd, 0);

    return {
      pool: `monolith-market-lending-${m}`,
      chain: 'Ethereum',
      project: PROJECT,
      symbol: collateralSymbol,
      mintedCoin,
      borrowToken: coin,
      apy: 0,
      // cdp => tvlUsd = totalSupplyUsd
      tvlUsd: totalSupplyUsd,
      underlyingTokens: [collateral],
      url: 'https://app.monolith.market/coins',
      totalSupplyUsd,
      totalBorrowUsd,
      availableBorrowUsd,
      apyBaseBorrow: borrowApy,
      borrowable: availableBorrowUsd > 0,
      ltv,
    };
  });

  // savings vaults (ERC4626), a vault's asset is the coin minted by the cdp markets
  const savingsVaults = savingsMarketIndexes.map((marketIndex) => {
    const underlying = coins[marketIndex];
    const vaultSymbol = vaultSymbolsByIndex[marketIndex];
    const coinPriceUsd = pricesByAddress[underlying.toLowerCase()] || 0;
    const totalSupplyUsd = coinPriceUsd * Number(vaultAssets[marketIndex]) / 1e18
    const stakingApr = Number(ratesByIndex[marketIndex][1]) / 1e16;
    const apy = utils.aprToApy(stakingApr, blocksPerYear);

    return {
      pool: `monolith-market-savings-${vaults[marketIndex]}`,
      chain: 'Ethereum',
      project: PROJECT,
      symbol: vaultSymbol,
      tvlUsd: totalSupplyUsd,
      apyBase: apy,
      underlyingTokens: [underlying],
      url: 'https://app.monolith.market/earn'
    };
  });

  return cdpMarkets.concat(savingsVaults).filter((p) => utils.keepFinite(p));
}

async function apy() {
  const factoriesChains = Object.keys(FACTORIES);

  const chainPools = await Promise.all(
    factoriesChains.map(factoryChain => getChainPools(factoryChain))
  )

  return chainPools.flat();
}

module.exports = {
  protocolId: '7808',
  timetravel: false,
  apy,
  url: 'https://app.monolith.market',
};
