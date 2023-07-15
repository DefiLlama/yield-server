const axios = require('axios');
const { default: BigNumber } = require('bignumber.js');
const { convertToAssets, totalAssets } = require('./queries');

const getTokenPrice = async (tokenAddress) => {
  const priceKey = `ethereum:${tokenAddress}`;
  const tokenPrice = (
    await axios.get(`https://coins.llama.fi/prices/current/${priceKey}`)
  ).data.coins[priceKey]?.price;
  return tokenPrice;
};

const getAPY = async (strategy, initialPosition, versionFactor = 1) => {
  const assets = await convertToAssets(strategy, initialPosition);
  return new BigNumber(assets)
    .dividedBy(initialPosition)
    .multipliedBy(versionFactor);
};

const vaultApys = async () => {
  const apys = {};

  const totalAssetsETHPhoria =
    (await totalAssets('0x5fe4b38520e856921978715c8579d2d7a4d2274f')) / 1e18;
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
      initialPosition: '1000000000000000000',
      decimals: 18,
    },
    {
      address: '0x287f941aB4B5AaDaD2F13F9363fcEC8Ee312a969',
      name: 'FudVault',
      symbol: 'aEthUSDC',
      tvl: totalAssetsFudVault,
      underlyingTokens: ['0x98C23E9d8f34FEFb1B7BD6a91B7FF122F4e16F5c'],
      initialPosition: '150000000000',
      decimals: 6,
    },
    {
      address: '0x463f9ed5e11764eb9029762011a03643603ad879',
      name: 'Volatility Vault',
      symbol: 'stETHvv',
      tvl: totalAssetsSTETHvv * lidoTokenPrice,
      underlyingTokens: ['0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84'],
      initialPosition: '638537294599340499',
      decimals: 18,
      versionFactor: new BigNumber(lastYieldFromV1).dividedBy(firstYieldFromV2),
    },
  ];

  return await Promise.all(
    vaults.map(async (vault) => {
      const strategy = vault.address;

      const apy = (
        await getAPY(
          strategy,
          new BigNumber(vault.initialPosition),
          vault.versionFactor
        )
      ).toNumber();

      let finalApy = apy;
      if (strategy === '0x287f941aB4B5AaDaD2F13F9363fcEC8Ee312a969') {
        finalApy = apy - 1.003328;
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
      };
    })
  );
};

module.exports = {
  timetravel: false,
  apy: vaultApys,
  url: 'https://app.pods.finance',
};
