const axios = require('axios');
const { default: BigNumber } = require('bignumber.js');
const { convertToAssets, totalAssets } = require('./queries');

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

const vaultApys = async () => {
  const apys = {};

  // calculate BASE APY
  const thirtyDaysAgo = Math.floor(Date.now() / 1000) - 30 * 24 * 60 * 60;
  const blockNumber30daysAgo = await getBlockNumberFromTimestamp(thirtyDaysAgo);

  const totalAssetsETHPhoria30daysAgo = await totalAssets(
    '0x5fe4b38520e856921978715c8579d2d7a4d2274f',
    blockNumber30daysAgo
  );
  const totalAssetsFudVault30daysAgo = await totalAssets(
    '0x287f941aB4B5AaDaD2F13F9363fcEC8Ee312a969',
    blockNumber30daysAgo
  );
  const totalAssetsSTETHvv30daysAgo = await totalAssets(
    '0x463f9ed5e11764eb9029762011a03643603ad879',
    blockNumber30daysAgo
  );

  // Inception APY
  const totalAssetsETHPhoria = await totalAssets(
    '0x5fe4b38520e856921978715c8579d2d7a4d2274f'
  );
  const totalAssetsFudVault =
    (await totalAssets('0x287f941aB4B5AaDaD2F13F9363fcEC8Ee312a969')) / 1e6;
  const totalAssetsSTETHvv =
    (await totalAssets('0x463f9ed5e11764eb9029762011a03643603ad879')) / 1e18;

  const lidoTokenPrice = await getTokenPrice(
    '0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84'
  );

  const lastYieldFromV1 = '1.0284808574603643';
  const firstYieldFromV2 = '1.011289282624759';
  const vaults = [
    {
      address: '0x5fe4b38520e856921978715c8579d2d7a4d2274f',
      name: 'ETHPhoria',
      symbol: 'stETH',
      tvl: totalAssetsETHPhoria * lidoTokenPrice,
      underlyingTokens: ['0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84'],
      initialPositionInception: '1000000000000000000',
      initialPosition: new BigNumber(totalAssetsETHPhoria30daysAgo),
      decimals: 18,
    },
    {
      address: '0x287f941aB4B5AaDaD2F13F9363fcEC8Ee312a969',
      name: 'FudVault',
      symbol: 'aEthUSDC',
      tvl: totalAssetsFudVault,
      underlyingTokens: ['0x98C23E9d8f34FEFb1B7BD6a91B7FF122F4e16F5c'],
      initialPositionInception: '150000000000',
      initialPosition: new BigNumber(totalAssetsFudVault30daysAgo),
      decimals: 6,
    },
    {
      address: '0x463f9ed5e11764eb9029762011a03643603ad879',
      name: 'Volatility Vault',
      symbol: 'stETHvv',
      tvl: totalAssetsSTETHvv * lidoTokenPrice,
      underlyingTokens: ['0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84'],
      initialPositionInception: '638537294599340499',
      initialPosition: new BigNumber(totalAssetsSTETHvv30daysAgo),
      decimals: 18,
      versionFactor: new BigNumber(lastYieldFromV1).dividedBy(firstYieldFromV2),
    },
  ];

  return await Promise.all(
    vaults.map(async (vault) => {
      const strategy = vault.address;

      const apy30Days = (
        await getAPY(
          strategy,
          vault.initialPosition,
          vault.versionFactor,
          blockNumber30daysAgo
        )
      ).toNumber();

      const apyInception = (
        await getAPY(
          strategy,
          vault.initialPositionInception,
          vault.versionFactor
        )
      ).toNumber();

      let finalApy = apy30Days;
      let finalApyInception = apyInception;
      if (strategy === '0x287f941aB4B5AaDaD2F13F9363fcEC8Ee312a969') {
        finalApy = apy30Days - 1.003328;
        finalApyInception = apyInception - 1.003328;
      }

      return {
        pool: `${strategy}-ethereum`,
        chain: 'Ethereum',
        project: 'pods-yield',
        symbol: vault.symbol,
        tvlUsd: vault.tvl,
        apyBase: (finalApy - 1) * 100,
        underlyingTokens: vault.underlyingTokens,
        poolMeta: vault.name,
        apyBaseInception: (finalApyInception - 1) * 100,
      };
    })
  );
};

module.exports = {
  timetravel: false,
  apy: vaultApys,
  url: 'https://app.pods.finance',
};
