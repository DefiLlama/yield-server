const sdk = require('@defillama/sdk');
const superagent = require('superagent');
const ethers = require('ethers');
const { getUniqueAddresses } = require('@defillama/sdk/build/generalUtil');
const utils = require('../utils');
const lensAbi = require('./lensAbi');
const lenderAbi = require('./lenderAbi');
const factoryAbi = require('./factoryAbi');
const vaultAbi = require('./vaultAbi');
const path = require('path');

const PROJECT = 'monolith-market';

const mainnetProvider = new ethers.providers.JsonRpcProvider(
  process.env.ALCHEMY_CONNECTION_ETHEREUM
);

const FACTORIES = {
  ethereum: { chainId: 1, blocksPerYear: 2609750, provider: mainnetProvider, factory: '0x6D961c9DCF1AD73566822BA4B087892e3839B849', lens: '0x156a901EE34cBd7af4035cbc964019112835d7aB', fromBlock: 24949282 },
}

const CREATE_DEPLOYMENT_EVENT =
  'event Deployed(address indexed lender, address indexed coin, address indexed vault)';

const simpleCalls = (arr, params) => {
  return arr.map(a => ({ target: a, params }))
}

async function getChainPools(chain) {
  const latestBlock = await sdk.api.util.getLatestBlock(chain);
  const toBlock = latestBlock.number;

  const { factory, chainId, lens, provider, blocksPerYear, fromBlock } = FACTORIES[chain];

  const factoryContract = new ethers.Contract(factory, factoryAbi, provider);
  const logs = await factoryContract.queryFilter(factoryContract.filters.Deployed(), fromBlock, toBlock);

  const lenders = logs.map(l => l.args.lender)
  const coins = logs.map(l => l.args.coin)
  const vaults = logs.map(l => l.args.vault)

  const [
    rates,
    vaultSymbols,
    coinSymbols,
    vaultAssets,
    totalPaidDebts,
    totalFreeDebts,
    collateralFactors,
    collaterals,
    collateralsPriceData,
  ] = (await Promise.all([
    sdk.api.abi.multiCall({
      chain, abi: lensAbi.find(a => a.name === 'getRates'), calls: lenders.map(lender => {
        return {
          target: lens,
          params: [lender],
        }
      })
    }),
    sdk.api.abi.multiCall({ chain, abi: 'erc20:symbol', calls: simpleCalls(vaults) }),
    sdk.api.abi.multiCall({ chain, abi: 'erc20:symbol', calls: simpleCalls(coins) }),
    sdk.api.abi.multiCall({ chain, abi: vaultAbi.find(a => a.name === 'totalAssets'), calls: simpleCalls(vaults) }),
    sdk.api.abi.multiCall({ chain, abi: lenderAbi.find(a => a.name === 'totalPaidDebt'), calls: simpleCalls(lenders) }),
    sdk.api.abi.multiCall({ chain, abi: lenderAbi.find(a => a.name === 'totalFreeDebt'), calls: simpleCalls(lenders) }),
    sdk.api.abi.multiCall({ chain, abi: lenderAbi.find(a => a.name === 'collateralFactor'), calls: simpleCalls(lenders) }),
    sdk.api.abi.multiCall({ chain, abi: lenderAbi.find(a => a.name === 'collateral'), calls: simpleCalls(lenders) }),
    sdk.api.abi.multiCall({ chain, abi: lenderAbi.find(a => a.name === 'getCollateralPrice'), calls: simpleCalls(lenders) }),
  ])).map(r => r.output.map(o => o.output));

  const [
    collateralSymbols,
    collateralDecimals,
    collateralDeposits,
    pricesData,
  ] = (await Promise.all([
    sdk.api.abi.multiCall({ chain, abi: 'erc20:symbol', calls: simpleCalls(collaterals) }),
    sdk.api.abi.multiCall({ chain, abi: 'erc20:decimals', calls: simpleCalls(collaterals) }),
    sdk.api.abi.multiCall({
      chain, abi: 'erc20:balanceOf', calls: collaterals.map((col,i) => {
        return {
          target: col,
          params: [lenders[i]],
        }
      })
    }),
    utils.getPrices(coins.concat(collaterals), chain),
  ])).map(r => r.output ? r.output.map(o => o.output) : r);

  const { pricesByAddress } = pricesData;

  // CDP markets, where coins are minted against collaterals
  const cdpMarkets = lenders.map((m, marketIndex) => {
    const collateral = collaterals[marketIndex];
    const collateralSymbol = collateralSymbols[marketIndex];
    const collateralDecimal = collateralDecimals[marketIndex];
    const mintedCoin = coinSymbols[marketIndex];
    
    const coin = coins[marketIndex];
    const coinPriceUsd = pricesByAddress[coin.toLowerCase()] || 0;
    
    const { price: oraclePrice } = collateralsPriceData[marketIndex];
    const oraclePriceUsd = (Number(oraclePrice) / (10 ** (36 - collateralDecimal))) || 0;
    // use defillama if available otherwise fallback to oracle price
    const collateralPriceUsd = pricesByAddress[collateral.toLowerCase()] || oraclePriceUsd;
    const totalSupplyUsd = collateralPriceUsd * Number(collateralDeposits[marketIndex]) / (10 ** collateralDecimal)
    const totalBorrowUsd = coinPriceUsd * (Number(totalPaidDebts[marketIndex]) / 1e18 + Number(totalFreeDebts[marketIndex]) / 1e18);
    const borrowApr = Number(rates[marketIndex][0]) / 1e16;
    const borrowApy = utils.aprToApy(borrowApr, blocksPerYear)

    return {
      pool: `monolith-market-lending-${m}`,
      chain: 'Ethereum',
      project: PROJECT,
      symbol: collateralSymbol,
      mintedCoin,
      // cdp => tvlUsd = totalSupplyUsd
      tvlUsd: totalSupplyUsd,
      underlyingTokens: [collateral],
      url: 'https://app.monolith.market/1/coin/' + marketIndex,
      totalSupplyUsd,
      totalBorrowUsd,
      apyBaseBorrow: borrowApy,
      borrowable: true,
      ltv: Number(collateralFactors[marketIndex]) / 1e4,
    };
  });

  // savings vaults (ERC4626), a vault's asset is a coin minted by the cdp markets
  const savingsVaults = lenders.map((m, marketIndex) => {
    const underlying = coins[marketIndex];
    const vaultSymbol = vaultSymbols[marketIndex];
    const coinPriceUsd = pricesByAddress[underlying.toLowerCase()] || 0;
    const totalSupplyUsd = coinPriceUsd * Number(vaultAssets[marketIndex]) / 1e18
    const stakingApr = Number(rates[marketIndex][1]) / 1e16;
    const apy = utils.aprToApy(stakingApr, blocksPerYear);

    return {
      pool: `monolith-market-savings-${vaults[marketIndex]}`,
      chain: 'Ethereum',
      project: PROJECT,
      symbol: vaultSymbol,
      tvlUsd: totalSupplyUsd,
      apyBase: apy,
      underlyingTokens: [underlying],
      url: 'https://app.monolith.market/1/coin/' + marketIndex,
      totalSupplyUsd,
      tvlUsd: totalSupplyUsd,
      borrowable: false,
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
  timetravel: false,
  apy,
  url: 'https://app.monolith.market',
};