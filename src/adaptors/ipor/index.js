const superagent = require('superagent');
const sdk = require('@defillama/sdk');
const { liquidityMiningV2Abi } = require('./abiV2');

const LP_STATS_URL = 'https://api.ipor.io/monitor/liquiditypool-statistics';
const COIN_PRICES_URL = 'https://coins.llama.fi/prices/current';

const LM_ADDRESS = '0xCC3Fc4C9Ba7f8b8aA433Bc586D390A70560FF366';
const IPOR_TOKEN = '0x1e4746dc744503b53b4a082cb3607b169a289090';

const BLOCKS_PER_YEAR = (365 * 24 * 3600) / 12;

const apy = async () => {
  const assets = (await superagent.get(LP_STATS_URL)).body.assets;
  const coinKeys = assets.map(
    (assetData) => 'ethereum:' + assetData.assetAddress
  );
  coinKeys.push('ethereum:' + IPOR_TOKEN);
  const coinPrices = (
    await superagent.get(
      `${COIN_PRICES_URL}/${coinKeys.join(',').toLowerCase()}`
    )
  ).body.coins;
  const iporTokenUsdPrice = coinPrices['ethereum:' + IPOR_TOKEN].price;

  const lpTokenAddresses = assets.map(
    (assetData) => assetData.ipTokenAssetAddress
  );

  const globalStats = new Map(
    (
      await sdk.api.abi.multiCall({
        abi: liquidityMiningV2Abi.find(
          ({ name }) => name === 'getGlobalIndicators'
        ),
        calls: [{
          target: LM_ADDRESS,
          params: [lpTokenAddresses],
        }],
      })
    ).output.flatMap((response) => response.output.map((stats) => [stats.lpToken.toLowerCase(), stats.indicators])
  ));
  const pools = [];

  for (const asset of assets) {
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
    const liquidityMiningGlobalStats = globalStats.get(
      asset.ipTokenAssetAddress.toLowerCase()
    );
    if (asset.asset === 'stETH') {
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
        rewardTokens: [IPOR_TOKEN],
      });
    } else {
      const apyReward =
        (((liquidityMiningGlobalStats.rewardsPerBlock /
          1e8 /
          (liquidityMiningGlobalStats.aggregatedPowerUp / 1e18)) *
          0.2 * //base powerup
          BLOCKS_PER_YEAR *
          iporTokenUsdPrice) /
          lpTokenPrice /
          2) * //50% early withdraw fee
        100; //percentage

      pools.push({
        pool: asset.assetAddress + '-ethereum',
        chain: 'Ethereum',
        project: 'ipor',
        symbol: asset.asset,
        tvlUsd: lpBalance * coinPrice,
        apyBase: Number(lpApr),
        apyReward: Number(apyReward),
        underlyingTokens: [asset.assetAddress],
        rewardTokens: [IPOR_TOKEN],
      });
    }
  }

  return pools;
};

module.exports = {
  timetravel: false,
  apy: apy,
  url: 'https://app.ipor.io/pools',
};
