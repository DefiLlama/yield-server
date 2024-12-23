const utils = require('../utils');
const sdk = require('@defillama/sdk');

const vaultData = async () => {
  const vaults = await utils.getData(
    'https://backend.nucleusearn.io/v1/protocol/markets'
  );
  const tokens = await utils.getData(
    'https://backend.nucleusearn.io/v1/protocol/tokens'
  );

  let pools = [];
  await Promise.all(
    Object.keys(vaults).map(async (vaultAddress) => {
      try {
        const vaultApyQuery = await utils.getData(
          `https://backend.nucleusearn.io/v1/vaults/apy?token_address=${vaultAddress}&lookback_days=14`
        );
        const vaultSymbol = await sdk.api2.erc20.symbol(vaultAddress);

        const ethereumApi = new sdk.ChainApi({ chain: 'ethereum' });
        const vaultBalances = await ethereumApi.sumTokens({
          owner: vaultAddress,
          tokens: tokens,
        });
        const usdBalance = await ethereumApi.getUSDValue();
        console.log('Vault TVL: ', usdBalance);

        console.log('Vault Symbol: ', vaultSymbol);
        const pool = {
          pool: `${vaultAddress}-ethereum`,
          chain: 'Ethereum',
          project: 'nucleus',
          symbol: vaultSymbol.output,
          tvlUsd: usdBalance,
          apy: vaultApyQuery.apy, // 14 days apy
        };
        pools.push(pool);
      } catch (error) {
        console.error(`Error processing vault: ${vaultAddress}`, error);
      }
    })
  );

  return pools;
};

module.exports = {
  timetravel: false,
  apy: vaultData,
  url: 'https://app.nucleusearn.io/dashboard',
};
