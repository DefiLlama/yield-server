const sdk = require('@defillama/sdk');
const { UiPoolDataProviderABI } = require('./abis');
const { default: BigNumber } = require("bignumber.js");

const RAY = "1000000000000000000000000000";
const SECONDS_PER_YEAR = "31536000";

const calculateApyBorrow = (variableBorrowRate) => {
  const apr = variableBorrowRate / parseInt(RAY);

  const base = apr / parseInt(SECONDS_PER_YEAR) + 1;

  const apy = base ** parseInt(SECONDS_PER_YEAR) - 1;

  return apy;
};

const poolsFunction = async () => {
  const reserveBalances = {};

  const { output: simpleReservesData } = await sdk.api.abi.call({
    target: "0x5250cCE48E43AB930e45Cc8E71C87Ca4B51244cf",   // TODO: Mainnet UIDataProvider Address
    params: ["0x24451F47CaF13B24f4b5034e1dF6c0E401ec0e46"], // TODO: Mainnet LendPoolAddressProvider Address
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
      apy: calculateApyBorrow(BigNumber(d.variableBorrowRate).div(1e18).toNumber())
    };
  });

  return pools;
};

module.exports = {
  timetravel: false,
  apy: poolsFunction,
  url: 'https://app.unlockd.finance', // TODO Mainnet Dapp Address
};
