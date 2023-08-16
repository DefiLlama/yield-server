const axios = require('axios');
const { default: BigNumber } = require('bignumber.js');
const { convertToAssets, totalAssets } = require('./queries');
const { getProvider } = require('@defillama/sdk/build/general');
const provider = getProvider('ethereum');

// ****
// HELPER FUNCTIONS
// ****
const getBlockNumberFromTimestamp = async (timestamp) => {
  const response = await axios.get(
    `https://coins.llama.fi/block/ethereum/${timestamp}`
  );
  return response.data.height;
};

const getTokenPrice = async (tokenAddress) => {
  const priceKey = `ethereum:${tokenAddress}`;
  const tokenPrice = (
    await axios.get(`https://coins.llama.fi/prices/current/${priceKey}`)
  ).data.coins[priceKey]?.price;
  return tokenPrice;
};

const getAPY = async (
  strategy,
  initialPosition,
  versionFactor = 1,
  blockNumber = 'latest'
) => {
  const assets = await convertToAssets(strategy, initialPosition, blockNumber);
  return new BigNumber(assets)
    .dividedBy(initialPosition)
    .multipliedBy(versionFactor);
};

// ****
// MAIN FUNCTION
// ****

const vaultApys = async () => {
  const apys = {};

  const volatilityVaultAddress = '0x463f9ed5e11764eb9029762011a03643603ad879';
  const fudVaultAddress = '0x287f941aB4B5AaDaD2F13F9363fcEC8Ee312a969';
  const ethPhoriaAddress = '0x5fe4b38520e856921978715c8579d2d7a4d2274f';

  const totalAssetsETHPhoria = (await totalAssets(ethPhoriaAddress)) / 1e18;
  const totalAssetsFudVault = (await totalAssets(fudVaultAddress)) / 1e6;
  const totalAssetsSTETHvv = (await totalAssets(volatilityVaultAddress)) / 1e18;

  const lidoTokenPrice = await getTokenPrice(
    '0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84'
  );

  const lastYieldFromV1 = '1.0284808574603643';
  const firstYieldFromV2 = '1.011289282624759';

  const vaults = [
    {
      address: ethPhoriaAddress,
      name: 'ETHPhoria',
      symbol: 'stETH',
      tvl: totalAssetsETHPhoria * lidoTokenPrice,
      underlyingTokens: ['0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84'],
      initialPosition: '1000000000000000000',
      decimals: 18,
      deployBlock: 16901984,
    },
    {
      address: fudVaultAddress,
      name: 'FudVault',
      symbol: 'aEthUSDC',
      tvl: totalAssetsFudVault,
      underlyingTokens: ['0x98C23E9d8f34FEFb1B7BD6a91B7FF122F4e16F5c'],
      initialPosition: '150000000000',
      decimals: 6,
      deployBlock: 17118350,
    },
    {
      address: volatilityVaultAddress,
      name: 'Volatility Vault',
      symbol: 'stETHvv',
      tvl: totalAssetsSTETHvv * lidoTokenPrice,
      underlyingTokens: ['0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84'],
      initialPosition: '638537294599340499',
      decimals: 18,
      deployBlock: 15079795,
      versionFactor: new BigNumber(lastYieldFromV1).dividedBy(firstYieldFromV2),
    },
  ];

  return await Promise.all(
    vaults.map(async (vault) => {
      const strategy = vault.address;

      // calculate baseAPY - 1 day period
      const yesterday = Math.floor(Date.now() / 1000) - 24 * 60 * 60;
      const blockNumberYesterday = await getBlockNumberFromTimestamp(yesterday);
      const positionYesterday = await totalAssets(
        strategy,
        blockNumberYesterday
      );
      const positionToday = await totalAssets(strategy, 'latest');

      const apyBase = (
        await getAPY(
          strategy,
          new BigNumber(positionToday).minus(positionYesterday),
          vault.versionFactor
        )
      ).toNumber();

      const apyInception = (
        await getAPY(
          strategy,
          new BigNumber(vault.initialPosition),
          vault.versionFactor
        )
      ).toNumber();

      let finalApyInception = apyInception;
      let finalApyBase = apyBase;
      if (strategy === fudVaultAddress) {
        finalApyInception = apyInception - 1.003328;
        finalApyBase = apyBase - 1.003328;
      }

      const block = await provider.getBlock(vault.deployBlock);
      const NUM_OF_DAYS_YEAR = 365;

      const daysDiff = Date.now() / 1000 - block.timestamp;
      const numOfDays = daysDiff / (24 * 60 * 60); // 1 day in seconds
      const expoent = NUM_OF_DAYS_YEAR / numOfDays;

      const projectedAPY = finalApyInception ** expoent - 1;
      const apyBaseInception = projectedAPY * 100;

      return {
        pool: `${strategy}-ethereum`,
        chain: 'Ethereum',
        project: 'pods-yield',
        symbol: vault.symbol,
        tvlUsd: vault.tvl,
        apyBase: finalApyBase - 1,
        underlyingTokens: vault.underlyingTokens,
        poolMeta: vault.name,
        apyBaseInception,
      };
    })
  );
};

module.exports = {
  timetravel: false,
  apy: vaultApys,
  url: 'https://app.pods.finance',
};
