const sdk = require('@defillama/sdk5');
const BigNumber = require('bignumber.js');

const abi = require('./abi');
const addresses = require('./addresses.json');


const apy = async () => {
  //                                 ---------------- ZLP ----------------
  const [
    { output: zlpStakingAumE30 },
  ] = await Promise.all([
    sdk.api.abi.call({
      abi: abi.getAumE30,
      chain: 'metis',
      target: addresses.CALCULATOR,
      params: [false],
    }),
  ]);

  const tvlUsdZlp = BigNumber(zlpStakingAumE30).dividedBy(
    1e30
  );

  const zlpStakingPool = {
    pool: `${addresses.ZLP}-metis`,
    chain: 'metis',
    project: 'zeno',
    symbol: 'ETH-USDC-USDT',
    tvlUsd: tvlUsdZlp.toNumber(),
    apyBase: 0,
    rewardTokens: [addresses.USDC],
    underlyingTokens: [
      addresses.WETH,
      addresses.USDC,
      addresses.USDT,
    ],
    poolMeta: 'ZLP Staking',
    url: 'https://zeno.exchange/metis/liquidity',
  };

  return [zlpStakingPool];
};

module.exports = {
  timetravel: false,
  apy: apy,
};
