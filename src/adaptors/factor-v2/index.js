const utils = require('../utils');
const sdk = require('@defillama/sdk3');
const { getMuxLpApr } = require('./mux-adapter');

// TODO: add more vaults incrementaly along with the strategy adapter
const vaults = [
  {
    poolAddress: '0x9F7323E95F9ee9f7Ec295d7545e82Cd93fA13f97',
    strategy: 'MuxStrategy',
    symbol: 'muxpMAC',
    underlyingToken: '0x7CbaF5a14D953fF896E5B3312031515c858737C8',
  },
];

async function poolDataRouter(poolAddress, underlyingTokenAddress, strategy) {
  let apr = 0;
  switch (strategy) {
    case 'MuxStrategy':
      apr = await getMuxLpApr();
  }
  const harvestCountPerDay = 3;
  const apyBase = utils.aprToApy(apr, harvestCountPerDay * 365);

  const underlyingTokenPrice = (
    await utils.getPrices([underlyingTokenAddress], 'arbitrum')
  ).pricesByAddress[underlyingTokenAddress.toLowerCase()];

  const { output: assetBalance } = await sdk.api.abi.call({
    target: poolAddress,
    abi: 'uint256:assetBalance',
    chain: 'arbitrum',
  });

  const tvlUsd = (assetBalance / 1e18) * underlyingTokenPrice;

  return { tvlUsd, apyBase };
}

async function getSingleYieldVaultAPY() {
  const poolData = await Promise.all(
    vaults.map(async (item) => {
      const project = 'factor-v2';
      const chain = 'arbitrum';
      const pool = `${item.poolAddress}-${chain}`.toLowerCase();
      const url = `https://app.factor.fi/vault/${item.poolAddress}`;
      const symbol = item.symbol;

      const { tvlUsd, apyBase } = await poolDataRouter(
        item.poolAddress,
        item.underlyingToken,
        item.strategy
      );

      return {
        pool,
        chain,
        project,
        symbol,
        tvlUsd,
        apyBase,
        underlyingTokens: [item.underlyingToken],
        url,
      };
    })
  );

  return poolData;
}

module.exports = {
  timetravel: false,
  apy: getSingleYieldVaultAPY,
};
