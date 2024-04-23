const superagent = require('superagent');
const sdk = require('@defillama/sdk');
const { liquidityMiningV2Abi } = require('./abiV2');

const LP_STATS_ETHEREUM_URL =
  'https://api.ipor.io/monitor/liquiditypool-statistics-1';
const LP_STATS_ARBITRUM_URL =
  'https://api.ipor.io/monitor/liquiditypool-statistics-42161';
const COIN_PRICES_URL = 'https://coins.llama.fi/prices/current';

const LM_ADDRESS_ETHEREUM = '0xCC3Fc4C9Ba7f8b8aA433Bc586D390A70560FF366';
const LM_ADDRESS_ARBITRUM = '0xdE645aB0560E5A413820234d9DDED5f4a55Ff6dd';
const IPOR_TOKEN_ETHEREUM = '0x1e4746dc744503b53b4a082cb3607b169a289090';

const BLOCKS_PER_YEAR = (365 * 24 * 3600) / 12;

const apy = async () => {
  const assetsEthereum = (await superagent.get(LP_STATS_ETHEREUM_URL)).body
    .assets;
  const assetsArbitrum = (await superagent.get(LP_STATS_ARBITRUM_URL)).body
    .assets;
  const coinKeys = assetsEthereum.map(
    (assetData) => 'ethereum:' + assetData.assetAddress
  );
  const coinKeysArbitrum = assetsArbitrum.map(
    (assetData) => 'arbitrum:' + assetData.assetAddress
  );

  coinKeys.push('ethereum:' + IPOR_TOKEN_ETHEREUM);
  coinKeys.push(...coinKeysArbitrum);

  const coinPrices = (
    await superagent.get(
      `${COIN_PRICES_URL}/${coinKeys.join(',').toLowerCase()}`
    )
  ).body.coins;
  const iporTokenUsdPrice = coinPrices['ethereum:' + IPOR_TOKEN_ETHEREUM].price;

  const lpTokenEthereumAddresses = assetsEthereum.map(
    (assetData) => assetData.ipTokenAssetAddress
  );

  const lpTokenArbitrumAddresses = assetsArbitrum.map(
    (assetData) => assetData.ipTokenAssetAddress
  );

  const globalStatsEthereum = new Map(
    (
      await sdk.api.abi.multiCall({
        chain: 'ethereum',
        abi: liquidityMiningV2Abi.find(
          ({ name }) => name === 'getGlobalIndicators'
        ),
        calls: [
          {
            target: LM_ADDRESS_ETHEREUM,
            params: [lpTokenEthereumAddresses],
          },
        ],
      })
    ).output.flatMap((response) =>
      response.output.map((stats) => [
        stats.lpToken.toLowerCase(),
        stats.indicators,
      ])
    )
  );

  const globalStatsArbitrum = new Map(
    (
      await sdk.api.abi.multiCall({
        chain: 'arbitrum',
        abi: liquidityMiningV2Abi.find(
          ({ name }) => name === 'getGlobalIndicators'
        ),
        calls: [
          {
            target: LM_ADDRESS_ARBITRUM,
            params: [lpTokenArbitrumAddresses],
          },
        ],
      })
    ).output.flatMap((response) =>
      response.output.map((stats) => [
        stats.lpToken.toLowerCase(),
        stats.indicators,
      ])
    )
  );

  const pools = [];

  for (const asset of assetsEthereum) {
    const lpApr = asset.periods.find(
      ({ period }) => period === 'MONTH'
    ).ipTokenReturnValue;
    const coinPrice =
      coinPrices['ethereum:' + asset.assetAddress.toLowerCase()].price;
    const lpBalanceHistory = asset.periods.find(
      ({ period }) => period === 'HOUR'
    ).totalLiquidity;
    const lpBalance =
      lpBalanceHistory[lpBalanceHistory.length - 1].totalLiquidity;
    const lpTokenPriceHistory = asset.periods.find(
      ({ period }) => period === 'HOUR'
    ).ipTokenExchangeRates;
    const lpTokenPrice =
      lpTokenPriceHistory[lpTokenPriceHistory.length - 1].exchangeRate;
    const liquidityMiningGlobalStats = globalStatsEthereum.get(
      asset.ipTokenAssetAddress.toLowerCase()
    );
      const apyReward =
        (((liquidityMiningGlobalStats.rewardsPerBlock /
          1e8 /
          (liquidityMiningGlobalStats.aggregatedPowerUp / 1e18)) *
          0.2 * //base powerup
          BLOCKS_PER_YEAR *
          iporTokenUsdPrice) /
          lpTokenPrice /
          coinPrice /
          2) * //50% early withdraw fee
        100; //percentage

      pools.push({
        pool: asset.ipTokenAssetAddress + '-ethereum',
        chain: 'Ethereum',
        project: 'ipor',
        symbol: asset.asset,
        tvlUsd: lpBalance * coinPrice,
        apyBase: Number(lpApr),
        apyReward: Number(apyReward),
        underlyingTokens: [asset.assetAddress],
        rewardTokens: [IPOR_TOKEN_ETHEREUM],
      });
  }

  for (const asset of assetsArbitrum) {
    const lpApr = asset.periods.find(
      ({ period }) => period === 'MONTH'
    ).ipTokenReturnValue;
    const coinPrice =
      coinPrices['arbitrum:' + asset.assetAddress.toLowerCase()].price;
    const lpBalanceHistory = asset.periods.find(
      ({ period }) => period === 'HOUR'
    ).totalLiquidity;
    const lpBalance =
      lpBalanceHistory[lpBalanceHistory.length - 1].totalLiquidity;
    const lpTokenPriceHistory = asset.periods.find(
      ({ period }) => period === 'HOUR'
    ).ipTokenExchangeRates;
    const lpTokenPrice =
      lpTokenPriceHistory[lpTokenPriceHistory.length - 1].exchangeRate;
    const liquidityMiningGlobalStats = globalStatsArbitrum.get(
      asset.ipTokenAssetAddress.toLowerCase()
    );
      const apyReward =
        (((liquidityMiningGlobalStats.rewardsPerBlock /
          1e8 /
          (liquidityMiningGlobalStats.aggregatedPowerUp / 1e18)) *
          0.2 * //base powerup
          BLOCKS_PER_YEAR *
          iporTokenUsdPrice) /
          lpTokenPrice /
          coinPrice /
          2) * //50% early withdraw fee
        100; //percentage

      pools.push({
        pool: asset.ipTokenAssetAddress + '-arbitrum',
        chain: 'Arbitrum',
        project: 'ipor',
        symbol: asset.asset,
        tvlUsd: lpBalance * coinPrice,
        apyBase: Number(lpApr),
        apyReward: Number(apyReward),
        underlyingTokens: [asset.assetAddress],
        rewardTokens: [IPOR_TOKEN_ETHEREUM],
      });
  }

  return pools;
};

module.exports = {
  timetravel: false,
  apy: apy,
  url: 'https://app.ipor.io/pools',
};
