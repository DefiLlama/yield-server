const sdk = require('@defillama/sdk');
const utils = require('../utils');

const { formatUnits } = require("ethers").utils;

const BUSD_ADDRESS = "0x602BaeaB9B0DE4a99C457cf1249088932AA04FaC";
const SBUSD_ADDRESS = "0x451812019238785086CFAC408D8A64f06898f6f5";
const SPOT_PRICE_ORACLE_ADDRESS = "0x095e7e8993A436adf87C90Da2314Da1EfB8F1bA0";

const CHAIN = "sonic";

const apy = async () => {
  const [
    { output: rewardRatePerSecond },
    { output: rewardDistributionEnd },
    { output: totalReserves },
    { output: pendingReward },
    { output: balance },
    { output: [,underlyingPrice] }
  ] = await Promise.all([
    sdk.api.abi.call({
      target: SBUSD_ADDRESS,
      abi: "function rewardRatePerSecond() view returns (uint256)",
      chain: CHAIN,
    }),
    sdk.api.abi.call({
      target: SBUSD_ADDRESS,
      abi: "function rewardDistributionEnd() view returns (uint256)",
      chain: CHAIN,
    }),
    sdk.api.abi.call({
      target: SBUSD_ADDRESS,
      abi: "function totalReserves() view returns (uint256)",
      chain: CHAIN,
    }),
    sdk.api.abi.call({
      target: SBUSD_ADDRESS,
      abi: "function pendingReward() view returns (uint256)",
      chain: CHAIN,
    }),
    sdk.api.abi.call({
      target: BUSD_ADDRESS,
      abi: "function balanceOf(address) view returns (uint256)",
      params: [SBUSD_ADDRESS],
      chain: CHAIN,
    }),
    sdk.api.abi.call({
      target: SPOT_PRICE_ORACLE_ADDRESS,
      abi: "function currentPrice() view returns (uint256,uint256)",
      chain: CHAIN,
    }),
  ]);

  const tvl = BigInt(balance) - BigInt(pendingReward) - BigInt(totalReserves);

  // underlyingPrice has 8 decimals, BUSD is 18 decimals => scale to 10^26
  const tvlUsd = Number(formatUnits(tvl * BigInt(underlyingPrice), 26));

  const now = Math.floor(Date.now() / 1000);
  const apr = (tvl > 0n && rewardDistributionEnd > now)
  ? formatUnits(BigInt(rewardRatePerSecond) * 86400n * 365n * 1_0000_0000n / tvl, 6) // scale factor = 1e6
  : 0;

  return [
    {
      pool: SBUSD_ADDRESS,
      chain: CHAIN,
      project: 'brunch',
      symbol: utils.formatSymbol('sbUSD'),
      tvlUsd,
      underlyingTokens: [BUSD_ADDRESS],
      apyBase: apr,
      apyReward: 0,
      rewardTokens: null,
    }
  ];
};

module.exports = {
  timetravel: false,
  apy,
  url: 'https://brunch.finance/stake',
};
