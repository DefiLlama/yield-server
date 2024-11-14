const superagent = require('superagent');
const sdk = require('@defillama/sdk');
const {liquidityMiningV2Abi} = require('./abiV2');

const COIN_PRICES_URL = 'https://coins.llama.fi/prices/current';

const CHAIN_CONFIG = {
  ethereum: {
    statsUrl: 'https://api.ipor.io/monitor/liquiditypool-statistics-1',
    lmAddress: '0xCC3Fc4C9Ba7f8b8aA433Bc586D390A70560FF366',
    iporToken: '0x1e4746dc744503b53b4a082cb3607b169a289090',
    urlTemplate: (asset) => `https://app.ipor.io/zap/ethereum/${asset.toLowerCase()}`,
    blocksPerYear: (365 * 24 * 3600) / 12
  },
  arbitrum: {
    statsUrl: 'https://api.ipor.io/monitor/liquiditypool-statistics-42161',
    lmAddress: '0xdE645aB0560E5A413820234d9DDED5f4a55Ff6dd',
    iporToken: '0x34229b3f16fbcdfa8d8d9d17c0852f9496f4c7bb',
    urlTemplate: (asset) => asset === 'USDM' ?
      `https://app.ipor.io/deposit/arbitrum/${asset.toLowerCase()}` : `https://app.ipor.io/zap/arbitrum/${asset.toLowerCase()}`,
    blocksPerYear: (365 * 24 * 3600) / 12 // On Arbitrum block.number is an approximated Ethereum block number
  },
  base: {
    statsUrl: 'https://api.ipor.io/monitor/liquiditypool-statistics-8453',
    lmAddress: '0xE9331948766593EE9CeBBB426faE317b44DaF0f2',
    iporToken: '0xbd4e5C2f8dE5065993d29A9794E2B7cEfc41437A',
    urlTemplate: (asset) => `https://app.ipor.io/deposit/base/${asset.toLowerCase()}`,
    blocksPerYear: (365 * 24 * 3600) / 2
  }
};

const getChainData = async (chain) => {
  const config = CHAIN_CONFIG[chain];
  const assets = (await superagent.get(config.statsUrl)).body.assets;

  const lpTokenAddresses = assets.map(
    (assetData) => assetData.ipTokenAssetAddress
  );

  const globalStats = new Map(
    (
      await sdk.api.abi.multiCall({
        chain,
        abi: liquidityMiningV2Abi.find(
          ({name}) => name === 'getGlobalIndicators'
        ),
        calls: [{
          target: config.lmAddress,
          params: [lpTokenAddresses],
        },],
      })
    ).output.flatMap((response) =>
      response.output.map((stats) => [
        stats.lpToken.toLowerCase(),
        stats.indicators,
      ])
    )
  );

  const poolPowerUpModifiers = new Map(
    (
      await sdk.api.abi.multiCall({
        chain,
        abi: liquidityMiningV2Abi.find(
          ({name}) => name === 'getPoolPowerUpModifiers'
        ),
        calls: lpTokenAddresses.map(address => ({
          target: config.lmAddress,
          params: [address]
        })),
      })
    ).output.map((response) => [
      response.input.params[0].toLowerCase(),
      response.output,
    ])
  );

  return {assets, globalStats, poolPowerUpModifiers};
};

const buildPool = (asset, chainData, chainConfig, chainName, iporTokenUsdPrice, coinPrices) => {
  const {globalStats, poolPowerUpModifiers} = chainData;

  const poolStartDate = new Date(asset.poolStartDate);
  const now = new Date();
  const poolAgeInDays = (now - poolStartDate) / (1000 * 60 * 60 * 24);

  let lpApr;
  if (poolAgeInDays < 7) {
    lpApr = asset.periods.find(({period}) => period === 'DAY').ipTokenReturnValue;
  } else if (poolAgeInDays < 30) {
    lpApr = asset.periods.find(({period}) => period === 'WEEK').ipTokenReturnValue;
  } else {
    lpApr = asset.periods.find(({period}) => period === 'MONTH').ipTokenReturnValue;
  }

  const coinPrice = coinPrices[`${chainName}:${asset.assetAddress.toLowerCase()}`].price;
  const lpBalanceHistory = asset.periods.find(({period}) => period === 'HOUR').totalLiquidity;
  const lpBalance = lpBalanceHistory[lpBalanceHistory.length - 1].totalLiquidity;
  const lpTokenPriceHistory = asset.periods.find(({period}) => period === 'HOUR').ipTokenExchangeRates;
  const lpTokenPrice = lpTokenPriceHistory[lpTokenPriceHistory.length - 1].exchangeRate;

  const liquidityMiningGlobalStats = globalStats.get(asset.ipTokenAssetAddress.toLowerCase());
  const vectorOfCurve = poolPowerUpModifiers.get(
    asset.ipTokenAssetAddress.toLowerCase()
  ).vectorOfCurve / 1e18;

  const apyReward = (((liquidityMiningGlobalStats.rewardsPerBlock / 1e8 /
          (liquidityMiningGlobalStats.aggregatedPowerUp / 1e18)) *
          (0.2 + vectorOfCurve) * //base powerup
          chainConfig.blocksPerYear *
          iporTokenUsdPrice) /
          lpTokenPrice /
          coinPrice /
          2) * //50% early withdraw fee
        100; //percentage

  return {
    pool: `${asset.ipTokenAssetAddress}-${chainName}`,
    chain: chainName.charAt(0).toUpperCase() + chainName.slice(1),
    project: 'ipor-derivatives',
    symbol: asset.asset,
    tvlUsd: lpBalance * coinPrice,
    apyBase: Number(lpApr),
    apyReward: Number(apyReward),
    underlyingTokens: [asset.assetAddress],
    rewardTokens: [chainConfig.iporToken],
    url: chainConfig.urlTemplate(asset.asset),
  };
};

const apy = async () => {
  const chainsData = await Promise.all(
    Object.entries(CHAIN_CONFIG).map(async ([chain, config]) => ({
      chain,
      config,
      data: await getChainData(chain)
    }))
  );

  const coinKeys = chainsData.flatMap(({chain, data}) =>
    data.assets.map(asset => `${chain}:${asset.assetAddress}`)
  );
  coinKeys.push('ethereum:' + CHAIN_CONFIG.ethereum.iporToken);

  const coinPrices = (
    await superagent.get(`${COIN_PRICES_URL}/${coinKeys.join(',').toLowerCase()}`)
  ).body.coins;

  const iporTokenUsdPrice = coinPrices['ethereum:' + CHAIN_CONFIG.ethereum.iporToken].price;

  return chainsData.flatMap(({chain, config, data}) =>
    data.assets.map(asset =>
      buildPool(asset, data, config, chain, iporTokenUsdPrice, coinPrices)
    )
  );
};

module.exports = {
  timetravel: false,
  apy: apy
};