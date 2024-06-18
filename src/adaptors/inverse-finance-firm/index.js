const ethers = require('ethers');
const ethersProviders = require('@ethersproject/providers');
const sdk = require('@defillama/sdk');
const superagent = require('superagent');
const BigNumber = require('bignumber.js');
const utils = require('../utils');
const abi = require('./abi');
const path = require('path');

require('dotenv').config({
  path: path.resolve(__dirname, '../../../config.env'),
});

const firmStart = 16159015;
const DBR = '0xAD038Eb671c44b853887A7E32528FaB35dC5D710';
const DOLA = '0x865377367054516e17014CcdED1e7d814EDC9ce4';

const provider = new ethers.providers.JsonRpcProvider(
  process.env.ALCHEMY_CONNECTION_ETHEREUM
);

const l1TokenPrices = async (l1TokenAddrs) => {
  const l1TokenQuery = l1TokenAddrs.map((addr) => `ethereum:${addr}`).join();
  const data = await utils.getData(
    `https://coins.llama.fi/prices/current/${l1TokenQuery}`
  );

  return Object.fromEntries(
    l1TokenAddrs.map((addr) => {
      const { decimals, price, symbol } = data.coins[`ethereum:${addr}`];
      return [addr, { price, decimals, symbol }];
    })
  );
};

const getFirmMarkets = async (dbrContract) => {
  const logs = await dbrContract.queryFilter(dbrContract.filters.AddMarket());
  return logs.map((l) => l.args.market);
};

const getFirmEscrowsWithMarket = async (markets, provider) => {
  const escrowCreations = await Promise.all(
    markets.map((m) => {
      const market = new ethers.Contract(m, abi.market, provider);
      return market.queryFilter(market.filters.CreateEscrow(), firmStart);
    })
  );

  const escrowsWithMarkets = escrowCreations
    .map((marketEscrows, marketIndex) => {
      const market = markets[marketIndex];
      return marketEscrows.map((escrowCreationEvent) => {
        return { escrow: escrowCreationEvent.args[1], market };
      });
    })
    .flat();

  return escrowsWithMarkets;
};

const main = async () => {
  const balances = {};

  const dbrContract = new ethers.Contract(DBR, abi.dbr, provider);
  const markets = await getFirmMarkets(dbrContract);

  const escrowsWithMarkets = await getFirmEscrowsWithMarket(markets, provider);

  const allBalances = (
    await sdk.api.abi.multiCall({
      chain: 'ethereum',
      calls: escrowsWithMarkets.map((em) => ({
        target: em.escrow,
        params: [],
      })),
      abi: abi.balance,
    })
  ).output;

  const allUnderlying = (
    await sdk.api.abi.multiCall({
      chain: 'ethereum',
      calls: markets.map((m) => ({
        target: m,
        params: [],
      })),
      abi: abi.collateral,
    })
  ).output;

  const underlyings = allUnderlying.map((u) => u.output);

  const allDebt = (
    await sdk.api.abi.multiCall({
      chain: 'ethereum',
      calls: markets.map((m) => ({
        target: m,
        params: [],
      })),
      abi: abi.totalDebt,
    })
  ).output;

  const allCfs = (
    await sdk.api.abi.multiCall({
      chain: 'ethereum',
      calls: markets.map((m) => ({
        target: m,
        params: [],
      })),
      abi: abi.collateralFactorBps,
    })
  ).output;

  const allBorrowPaused = (
    await sdk.api.abi.multiCall({
      chain: 'ethereum',
      calls: markets.map((m) => ({
        target: m,
        params: [],
      })),
      abi: abi.borrowPaused,
    })
  ).output;

  const allLiquidity = (
    await sdk.api.abi.multiCall({
      chain: 'ethereum',
      calls: markets.map((m) => ({
        target: DOLA,
        params: [m],
      })),
      abi: 'erc20:balanceOf',
    })
  ).output;

  const addressesToPrice = underlyings.concat([DBR, DOLA]);
  const prices = await l1TokenPrices(addressesToPrice);

  allBalances.map((b, i) => {
    const market = escrowsWithMarkets[i].market;
    if (!balances[market]) {
      balances[market] = BigNumber(0);
    }
    balances[market] = balances[market].plus(b.output);
  });

  // the current fixed borrow rate is always directly related to DBR's current price
  // (1 DBR allows to borrow 1 DOLA for one year)
  const currentFixedRate = prices[DBR].price * 100;

  const pools = markets.map((m, marketIndex) => {
    const underlying = allUnderlying.find((u) => u.input.target === m).output;
    const decimals = prices[underlying].decimals;
    const symbol = prices[underlying].symbol;
    const totalSupplyUsd =
      (Number(balances[m]) / 10 ** decimals) * prices[underlying].price;
    const totalBorrowUsd = Number(allDebt[marketIndex].output) / 1e18;
    const debtCeilingUsd =
      (Number(allLiquidity[marketIndex].output) / 1e18) * prices[DOLA].price;
    return {
      pool: `firm-${m}`,
      chain: 'Ethereum',
      project: 'inverse-finance-firm',
      mintedCoin: 'DOLA',
      symbol,
      tvlUsd: totalSupplyUsd,
      apyBase: 0,
      underlyingTokens: [underlying],
      poolMeta: 'Fixed Borrow Rate',
      url: 'https://inverse.finance/firm/' + symbol,
      apyBaseBorrow: currentFixedRate,
      debtCeilingUsd: debtCeilingUsd + totalBorrowUsd,
      totalSupplyUsd,
      totalBorrowUsd,
      borrowable: !allBorrowPaused[marketIndex].output,
      ltv: Number(allCfs[marketIndex].output) / 1e4,
    };
  });

  return utils.removeDuplicates(pools.filter((p) => utils.keepFinite(p)));
};

module.exports = {
  timetravel: false,
  apy: main,
};
