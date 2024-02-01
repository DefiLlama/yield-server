const { ethers } = require('ethers');
const {
  keomABI,
  unitrollerABI,
  erc20ABI,
  oracleABI,
  preminingABI,
} = require('./Abis');
const { PROVIDERS } = require('./Provider');
const sdk = require('@defillama/sdk');
const BigNumber = require('bignumber.js');

const chains = {
  polygon: {
    comptroller: '0x5B7136CFFd40Eee5B882678a5D02AA25A48d669F',
    oracle: '0x17feC0DD2c6BC438Fd65a1d2c53319BEA130BEFb',
  },
  polygon_zkevm: {
    comptroller: '0x6EA32f626e3A5c41547235ebBdf861526e11f482',
    oracle: '0x483aDB7c100F1E19369a7a33c80709cfdd124c4e',
  },
  manta: {
    comptroller: '0x91e9e99AC7C39d5c057F83ef44136dFB1e7adD7d',
    oracle: '0xfD01946C35C98D71A355B8FF18d9E1697b2dd2Ea',
  },
  isolated_manta_wusdm: {
    comptroller: '0x014991ec771aD943A487784cED965Af214FD253C',
    oracle: '0xfD01946C35C98D71A355B8FF18d9E1697b2dd2Ea',
  },
  isolated_manta_stone: {
    comptroller: '0x19621d19B40C978A479bd35aFB3740F90B7b0fE4',
    oracle: '0xfD01946C35C98D71A355B8FF18d9E1697b2dd2Ea',
  },
};

async function main() {
  let data = [];
  for (const name in chains) {
    let provider = PROVIDERS[name];
    let chain = name;

    if (name === 'isolated_manta_wusdm' || name === 'isolated_manta_stone') {
      chain = 'manta';
      provider = PROVIDERS[chain];
    }

    const comptroller = new ethers.Contract(
      chains[name].comptroller,
      unitrollerABI,
      provider
    );

    const markets = await comptroller.getAllMarkets();

    for (let market of markets) {
      const APYS = await getAPY(market, provider);
      const tvl = await getErc20Balances(market, provider);
      const ltv = await unitrollerContract.markets(market);

      const marketData = {
        pool: market,
        project: 'KEOM',
        symbol: APYS.symbol.slice(1),
        chain: name,
        apyBase: APYS.supplyAPY,
        tvlUsd: tvl.tvlUsd,
        // borrow fields
        apyBaseBorrow: APYS.borrowAPY,
        totalSupplyUsd: tvl.totalSupplyUsd,
        totalBorrowUsd: tvl.totalBorrowsUsd,
        ltv: parseInt(ltv.collateralFactorMantissa) / 1e18,
      };

      data.push(marketData);
    }
  }
  return data;
}

async function getAPY(strategy, provider) {
  const contract = new ethers.Contract(strategy, keomABI, provider);

  // get the symbol
  const symbol = await contract.symbol();

  // retrieve the supply rate per timestamp for the main0vixContract
  const supplyRatePerTimestamp = await contract.supplyRatePerTimestamp();

  const supplyAPY = calculateAPY(supplyRatePerTimestamp);

  const borrowRatePerTimestamp = await contract.borrowRatePerTimestamp();
  const borrowAPY = calculateAPY(borrowRatePerTimestamp);

  return { symbol, supplyAPY, borrowAPY };
}

function calculateAPY(rate) {
  const year = 365 * 24 * 60 * 60;
  let a = 1 + rate / 1e18;
  a = parseFloat(String(a));
  const b = Math.pow(a, year);
  return (b - 1) * 100;
}

async function getErc20Balances(strategy, provider) {
  // retrieve the asset contract
  const oTokenContract = new ethers.Contract(strategy, keomABI, provider);

  // get decimals for the oToken
  const oDecimals = parseInt(await oTokenContract.decimals());

  // get the total supply
  const oTokenTotalSupply = await oTokenContract.totalSupply();

  // get total borrows
  const oTokenTotalBorrows = await oTokenContract.totalBorrows();

  // get the exchange rate stored
  const oExchangeRateStored = await oTokenContract.exchangeRateStored();

  // // get the contract for the underlying token
  const underlyingTokenAddress = new ethers.Contract(
    strategy,
    erc20ABI,
    provider
  );

  // retrieve the oracle contract
  const oracle = new ethers.Contract(oracleContract, oracleABI, provider);

  // get the decimals for the underlying token
  const underlyingDecimals = parseInt(await underlyingTokenAddress.decimals());

  // get the underlying price of the asset from the oracle
  const oracleUnderlyingPrice = Number(
    await oracle.getUnderlyingPrice(strategy)
  );

  // do the conversions
  return convertTvlUSD(
    oTokenTotalSupply,
    oTokenTotalBorrows,
    oExchangeRateStored,
    oDecimals,
    underlyingDecimals,
    oracleUnderlyingPrice
  );
}

function convertUSDC(balance, exchangeRateStored, decimals) {
  return (
    (parseFloat(balance) * parseFloat(exchangeRateStored)) /
    Math.pow(1, Math.pow(10, decimals)) /
    Math.pow(1, Math.pow(10, 18))
  );
}

function convertTvlUSD(
  totalSupply,
  totalBorrows,
  exchangeRateStored,
  oDecimals,
  underlyingDecimals,
  oracleUnderlyingPrice
) {
  const totalSupplyUsd =
    (((totalSupply * exchangeRateStored) / 10 ** (18 + underlyingDecimals)) *
      oracleUnderlyingPrice) /
    10 ** (36 - underlyingDecimals);

  const totalBorrowsUsd =
    (totalBorrows * oracleUnderlyingPrice) / 10 ** (28 + underlyingDecimals);

  const tvlUsd = totalSupplyUsd - totalBorrowsUsd;

  return { totalSupplyUsd, totalBorrowsUsd, tvlUsd };
}

module.exports = {
  timetravel: false,
  apy: main,
  url: 'https://app.keom.io/',
};
