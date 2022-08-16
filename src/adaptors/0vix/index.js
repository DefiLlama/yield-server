const {
  master0vixContact,
  oMATICContract,
  WBTCStrategy,
  DAIStrategy,
  WETHStrategy,
  USDTStrategy,
  MATICStrategy,
  USDCStrategy,
  oracleContract,
} = require('./Addresses');
const { ethers, BigNumber } = require('ethers');
const { OvixABI, erc20ABI, oracleABI } = require('./Abis');
const { PROVIDER } = require('./Provider');
const sdk = require('@defillama/sdk');

const master0vix = '0x8849f1a0cB6b5D6076aB150546EddEe193754F1C';
const oMATIC = '0xE554E874c9c60E45F1Debd479389C76230ae25A8';
const matic = '0x0d500b1d8e8ef31e21c99d1db9a6444d3adf1270';

const strategiesList = [
  WBTCStrategy,
  DAIStrategy,
  WETHStrategy,
  USDTStrategy,
  USDCStrategy,
  MATICStrategy,
];

async function main() {
  let data = [];
  let tvlAndUnderlyingTokens;
  for (let strategy of strategiesList) {
    const OvixAPYs = await getAPY(strategy);
    if (strategy.name !== 'MATIC') {
      tvlAndUnderlyingTokens = await getErc20Balances(strategy);
    } else {
      // tvl = await getMaticBalance(strategy);
    }
    const newObj = {
      pool: strategy.address,
      project: strategy.project,
      symbol: strategy.name,
      chain: strategy.chain,
      underlyingTokens: tvlAndUnderlyingTokens.underlyingTokens,
      apyBase: OvixAPYs.supplyAPY,
      tvlUsd: tvlAndUnderlyingTokens.tvlUSD,
    };

    data.push(newObj);
  }
  return data;
}

async function getAPY(strategy) {
  const contract = new ethers.Contract(strategy.address, OvixABI, PROVIDER);

  // retrieve the supply rate per timestamp for the main0vixContract
  const supplyRatePerTimestamp = await contract.supplyRatePerTimestamp();

  const supplyAPY = calculateAPY(supplyRatePerTimestamp);

  const borrowRatePerTimestamp = await contract.borrowRatePerTimestamp();
  const borrowAPY = calculateAPY(borrowRatePerTimestamp);

  return { supplyAPY, borrowAPY };
}

function calculateAPY(rate) {
  const year = 365 * 24 * 60 * 60;
  let a = 1 + rate / 1e18;
  a = parseFloat(String(a));
  const b = Math.pow(a, year);
  return (b - 1) * 100;
}

async function getErc20Balances(strategy) {
  // retrieve the oracle contract
  const oracle = new ethers.Contract(oracleContract, oracleABI, PROVIDER);

  // retrieve the asset contract
  const erc20Contract = new ethers.Contract(
    strategy.address,
    OvixABI,
    PROVIDER
  );

  // create underlying tokens array
  let underlyingTokens = [];

  // get decimals for the oToken
  const oDecimals = parseInt(await erc20Contract.decimals());

  // get the total supply
  const oTokenTotalSupply = await erc20Contract.totalSupply();

  // get the exchange rate stored
  const oExchangeRateStored = await erc20Contract.exchangeRateStored();

  // get underlying token address
  const underlyingToken = await erc20Contract.underlying();
  // push the underlying token into the array
  underlyingTokens.push(underlyingToken);

  // get the contract for the underlying token
  const underlyingTokenAddress = new ethers.Contract(
    underlyingToken,
    erc20ABI,
    PROVIDER
  );

  // get the decimals for the underlying token
  const underlyingDecimals = parseInt(await underlyingTokenAddress.decimals());

  // get the underlying price of the asset from the oracle
  const oracleUnderlyingPrice = Number(
    await oracle.getUnderlyingPrice(strategy.address)
  );

  // do the conversions
  const tvlUSD = convertTvlUSD(
    oTokenTotalSupply,
    oExchangeRateStored,
    oDecimals,
    underlyingDecimals,
    oracleUnderlyingPrice
  );

  return { tvlUSD, underlyingTokens };
}

function convertTvlUSD(
  totalSupply,
  exchangeRateStored,
  oDecimals,
  underlyingDecimals,
  oracleUnderlyingPrice
) {
  return (
    (((totalSupply * exchangeRateStored) / 10 ** (18 + underlyingDecimals)) *
      oracleUnderlyingPrice) /
    10 ** (36 - underlyingDecimals)
  );
}

module.exports = {
  timetravel: false,
  apy: main,
  url: 'https://app.0vix.com/',
};
