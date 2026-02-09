const ethers = require('ethers');
const sdk = require('@defillama/sdk');
const superagent = require('superagent');
const BigNumber = require('bignumber.js');
const utils = require('../utils');
const abi = require('./abi');
const path = require('path');
const ERC4626abi = require('./ERC4626.json');

require('dotenv').config({
  path: path.resolve(__dirname, '../../../config.env'),
});

const firmStart = 16159015;
const DBR = '0xAD038Eb671c44b853887A7E32528FaB35dC5D710';
const DOLA = '0x865377367054516e17014CcdED1e7d814EDC9ce4';
const INV = '0x41D5D79431A913C4aE7d69a668ecdfE5fF9DFB68';
const SINV_ADDRESS = '0x08d23468A467d2bb86FaE0e32F247A26C7E2e994';
const SDOLA_ADDRESS = '0xb45ad160634c528Cc3D2926d9807104FA3157305';
const TOKENS_VIEWER = '0x826bBeB1DBd9aA36CD44538CC45Dcf9E93BDA574';
const FIRM_VIEWER = '0x545C963eB523199969cf0298395EeAdcE514b691';
const ONE_DAY_MS = 86400000;
const WEEKS_PER_YEAR = 365 / 7;

const provider = new ethers.providers.JsonRpcProvider(
  process.env.ALCHEMY_CONNECTION_ETHEREUM
);

const getWeekIndexUtc = (ts) => {
  const d = ts ? new Date(ts) : new Date();
  const weekFloat = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0) / (ONE_DAY_MS * 7);
  return Math.floor(weekFloat);
}

const aprToApy = (apr, compoundingsPerYear) =>
  !compoundingsPerYear ? apr : (Math.pow(1 + (apr / 100) / compoundingsPerYear, compoundingsPerYear) - 1) * 100;

const l1TokenPrices = async (l1TokenAddrs) => {
  const l1TokenQuery = l1TokenAddrs.map((addr) => `ethereum:${addr}`).join();
  const data = await utils.getData(
    `https://coins.llama.fi/prices/current/${l1TokenQuery}`
  );

  return Object.fromEntries(
    l1TokenAddrs.map((addr) => {
      const coinData = data.coins[`ethereum:${addr}`];
      if (coinData) {
        const { decimals, price, symbol } = coinData;
        return [addr, { price, decimals, symbol }];
      } else {
        return [addr, { price: null, decimals: null, symbol: null }];
      }
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
  const addressesToPrice = underlyings.concat([DBR, DOLA, INV]);
  const prices = await l1TokenPrices(addressesToPrice);

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

  const allSymbols = (
    await sdk.api.abi.multiCall({
      chain: 'ethereum',
      calls: underlyings.map((m) => ({
        target: m,
        params: [],
      })),
      abi: 'string:symbol',
    })
  ).output;

  const allDecimals = (
    await sdk.api.abi.multiCall({
      chain: 'ethereum',
      calls: underlyings.map((m) => ({
        target: m,
        params: [],
      })),
      abi: 'uint:decimals',
    })
  ).output;

  const allPrices = (
    await sdk.api.abi.multiCall({
      chain: 'ethereum',
      calls: markets.map((m) => ({
        target: FIRM_VIEWER,
        params: [m],
      })),
      abi: abi.getMarketPrice,
      permitFailure: true,
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
    const decimals = Number(allDecimals[marketIndex].output);
    const symbol = allSymbols[marketIndex].output;
    // use oracle price as fallback for exotic collaterals such as pendle collaterals
    const price = prices[underlying].price || (Number(allPrices[marketIndex].output)/1e18);
    const totalSupplyUsd =
      (Number(balances[m]) / 10 ** decimals) * price;
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
      url: 'https://inverse.finance/firm',
      apyBaseBorrow: currentFixedRate,
      debtCeilingUsd: debtCeilingUsd + totalBorrowUsd,
      totalSupplyUsd,
      totalBorrowUsd,
      borrowable: !allBorrowPaused[marketIndex].output,
      ltv: Number(allCfs[marketIndex].output) / 1e4,
    };
  });

  const weekIndex = getWeekIndexUtc();
  // sDOLA
  const sdolaData = (
    await Promise.all([
      sdk.api.abi.multiCall(
        {
          chain: 'ethereum',
          calls: [
            {
              target: SDOLA_ADDRESS,
              params: [],
            },
          ],
          abi: 'uint:totalAssets',
        }
      ),
      sdk.api.abi.multiCall(
        {
          chain: 'ethereum',
          calls: [
            {
              target: SDOLA_ADDRESS,
              params: [weekIndex - 1],
            },
          ],
          abi: abi.weeklyRevenue,
        }
      ),
    ])
  );

  const sDolaTotalAssets = Number(sdolaData[0].output[0].output) / 1e18;
  const sDolaPastWeekRevenue = Number(sdolaData[1].output[0].output) / 1e18;
  const sDOLAapr = sDolaTotalAssets > 0 ? (sDolaPastWeekRevenue * WEEKS_PER_YEAR) / sDolaTotalAssets * 100 : 0;

  // add sDOLA
  pools.push({
    pool: `sDOLA`,
    chain: 'Ethereum',
    project: 'inverse-finance-firm',
    mintedCoin: 'sDOLA',
    symbol: 'sDOLA',
    tvlUsd: sDolaTotalAssets * prices[DOLA].price,
    apyBase: aprToApy(sDOLAapr, WEEKS_PER_YEAR),
    underlyingTokens: [DOLA],
    poolMeta: 'Yield-Bearing stable',
    url: 'https://inverse.finance/sDOLA',
  });

  // sINV
  const sinvData = (
    await Promise.all([
      sdk.api.abi.multiCall(
        {
          chain: 'ethereum',
          calls: [
            {
              target: SINV_ADDRESS,
              params: [],
            },
          ],
          abi: 'uint:totalAssets',
        }
      ),
      sdk.api.abi.multiCall(
        {
          chain: 'ethereum',
          calls: [
            {
              target: SINV_ADDRESS,
              params: [],
            },
          ],
          abi: 'uint:lastPeriodRevenue',
        }
      ),
      sdk.api.abi.multiCall(
        {
          chain: 'ethereum',
          calls: [
            {
              target: TOKENS_VIEWER,
              params: [],
            },
          ],
          abi: 'uint:getDbrApr',
        }
      ),
    ])
  );

  const sInvTotalAssets = Number(sinvData[0].output[0].output) / 1e18;
  const sinvPastWeekRevenue = Number(sinvData[1].output[0].output) / 1e18;
  const sINVapr = sDolaTotalAssets > 0 ? (sinvPastWeekRevenue * WEEKS_PER_YEAR) / sInvTotalAssets * 100 : 0;
  const dbrApr = Number(sinvData[2].output[0].output) / 1e18;

  // add sINV
  pools.push({
    pool: `sINV`,
    chain: 'Ethereum',
    project: 'inverse-finance-firm',
    mintedCoin: 'sINV',
    symbol: 'sINV',
    tvlUsd: sInvTotalAssets * prices[INV].price,
    apyBase: aprToApy(sINVapr, WEEKS_PER_YEAR),
    underlyingTokens: [INV],
    url: 'https://inverse.finance/sINV',
  });

  return utils.removeDuplicates(pools.filter((p) => utils.keepFinite(p)));
};

module.exports = {
  timetravel: false,
  apy: main,
};
