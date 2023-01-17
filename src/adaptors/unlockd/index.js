const sdk = require('@defillama/sdk');
const { UiPoolDataProviderABI } = require('./abis');
const { default: BigNumber } = require("bignumber.js");
const utils = require('../utils');

const RAY = "1000000000000000000000000000";
const SECONDS_PER_YEAR = "31536000";

const calculateApyEarn = (liquidityRate) => {
  const aprNumber = Number(liquidityRate) / parseInt(RAY);

  const apyNumber =
    (aprNumber / parseInt(SECONDS_PER_YEAR) + 1) ** parseInt(SECONDS_PER_YEAR) -
    1;

  return apyNumber;
};

const poolsFunction = async () => {
  const reserveBalances = {};

  const { output: simpleReservesData } = await sdk.api.abi.call({
    target: "0x2CF74101dF653E166Cbf699EeED6FaB599293BcD",   // Mainnet UIDataProvider Address
    params: ["0xE6cd031FB0D9A79FD8CD3035B9228F78ff459B07"], // Mainnet LendPoolAddressProvider Address
    abi: UiPoolDataProviderABI.find((a) => a.name === "getSimpleReservesData"),
    chain: "ethereum",
  });
  simpleReservesData.forEach((d) => {
    reserveBalances[d.underlyingAsset] = new BigNumber(
      reserveBalances[d.underlyingAsset] || 0
    ).plus(d.availableLiquidity);
  });

  const pools = simpleReservesData.map((d) => {
    return {
      pool: d.underlyingAsset,
      chain: utils.formatChain('ethereum'),
      project: "unlockd",
      symbol: utils.formatSymbol(d.symbol),
      tvlUsd: reserveBalances[d.underlyingAsset],
      apy: calculateApyEarn(BigNumber(d.liquidityRate).div(1e18).toNumber())
    };
  });

  return pools;
};

module.exports = {
  timetravel: false,
  apy: poolsFunction,
  url: 'https://app.unlockd.finance/earn', // Mainnet DApp Address
};
