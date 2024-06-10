const superagent = require('superagent');
const sdk = require('@defillama/sdk');
const { liquidityMiningV2Abi } = require('./abiV2');

const LP_STATS_ETHEREUM_URL =
  'https://api.ipor.io/monitor/liquiditypool-statistics-1';
const LP_STATS_ARBITRUM_URL =
  'https://api.ipor.io/monitor/liquiditypool-statistics-42161';
const ARB_AIRDROP_URL = 'https://api.ipor.io/monitor/arb-airdrop';
const WSTETH_AIRDROP_URL = 'https://api.ipor.io/monitor/arb-lido-airdrop';
const COIN_PRICES_URL = 'https://coins.llama.fi/prices/current';

const LM_ADDRESS_ETHEREUM = '0xCC3Fc4C9Ba7f8b8aA433Bc586D390A70560FF366';
const LM_ADDRESS_ARBITRUM = '0xdE645aB0560E5A413820234d9DDED5f4a55Ff6dd';
const IPOR_TOKEN_ETHEREUM = '0x1e4746dc744503b53b4a082cb3607b169a289090';
const IPOR_TOKEN_ARBITRUM = '0x34229b3f16fbcdfa8d8d9d17c0852f9496f4c7bb';
const ARB_TOKEN_ARBITRUM = '0x912ce59144191c1204e64559fe8253a0e49e6548';
const WSTETH_TOKEN_ARBITRUM = '0x5979d7b546e38e414f7e9822514be443a4800529';

const BLOCKS_PER_YEAR = (365 * 24 * 3600) / 12;

const apy = async () => {
  const assetsEthereum = (await superagent.get(LP_STATS_ETHEREUM_URL)).body
    .assets;
  const assetsArbitrum = (await superagent.get(LP_STATS_ARBITRUM_URL)).body
    .assets;
  const arbAidrdop = (await superagent.get(ARB_AIRDROP_URL)).body;
  const arbAirdropLastEpochFinished = Date.parse(arbAidrdop.epochEnd) < Date.now(); //epochEnd will be date in past when last airdrop epoch will be finished
  const wstEthAirdrop = (await superagent.get(WSTETH_AIRDROP_URL)).body;
  const wstEthAirdropLastEpochFinished = Date.parse(wstEthAirdrop.epochEnd) < Date.now(); //epochEnd will be date in past when last airdrop epoch will be finished
  const coinKeys = assetsEthereum.map(
    (assetData) => 'ethereum:' + assetData.assetAddress
  );
  const coinKeysArbitrum = assetsArbitrum.map(
    (assetData) => 'arbitrum:' + assetData.assetAddress
  );

  coinKeys.push('ethereum:' + IPOR_TOKEN_ETHEREUM);
  coinKeys.push(...coinKeysArbitrum);
  coinKeys.push('arbitrum:' + ARB_TOKEN_ARBITRUM);
  coinKeys.push('arbitrum:' + WSTETH_TOKEN_ARBITRUM);
  const coinPrices = (
    await superagent.get(
      `${COIN_PRICES_URL}/${coinKeys.join(',').toLowerCase()}`
    )
  ).body.coins;
  const iporTokenUsdPrice = coinPrices['ethereum:' + IPOR_TOKEN_ETHEREUM].price;
  const arbTokenUsdPrice = coinPrices['arbitrum:' + ARB_TOKEN_ARBITRUM].price;
  const wstethTokenUsdPrice = coinPrices['arbitrum:' + WSTETH_TOKEN_ARBITRUM].price;

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
    const rewardsToken = [IPOR_TOKEN_ARBITRUM];
    if (asset.asset === 'wstETH' && !wstEthAirdropLastEpochFinished) {
      rewardsToken.push(WSTETH_TOKEN_ARBITRUM);
    }
    if (!arbAirdropLastEpochFinished) {
      rewardsToken.push(ARB_TOKEN_ARBITRUM);
    }
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

    let apyWstEthAirdrop = 0;
    if (asset.asset === 'wstETH' && !wstEthAirdropLastEpochFinished) {
      const rewardsWstEthIporRatio = wstEthAirdrop.pools.find(
        (assetData) => assetData.asset === asset.asset
      ).rewardsArbIporRatio;
      apyWstEthAirdrop =
        (((liquidityMiningGlobalStats.rewardsPerBlock /
          1e8 /
          (liquidityMiningGlobalStats.aggregatedPowerUp / 1e18)) *
          0.2 * //base powerup
          BLOCKS_PER_YEAR *
          wstethTokenUsdPrice * rewardsWstEthIporRatio) /
          lpTokenPrice /
          coinPrice) *
        100; //percentage
    }

    const rewardsArbIporRatio = arbAidrdop.pools.find(
      (assetData) => assetData.asset === asset.asset
    ).rewardsArbIporRatio;
    const apyAirdrop = !arbAirdropLastEpochFinished ?
      (((liquidityMiningGlobalStats.rewardsPerBlock /
        1e8 /
        (liquidityMiningGlobalStats.aggregatedPowerUp / 1e18)) *
        0.2 * //base powerup
        BLOCKS_PER_YEAR *
        arbTokenUsdPrice * rewardsArbIporRatio) /
        lpTokenPrice /
        coinPrice) *
      100 //percentage
      : 0;

    pools.push({
      pool: asset.ipTokenAssetAddress + '-arbitrum',
      chain: 'Arbitrum',
      project: 'ipor',
      symbol: asset.asset,
      tvlUsd: lpBalance * coinPrice,
      apyBase: Number(lpApr),
      apyReward: Number(apyReward + apyWstEthAirdrop + apyAirdrop),
      underlyingTokens: [asset.assetAddress],
      rewardTokens: rewardsToken,
    });
  }

  return pools;
};

module.exports = {
  timetravel: false,
  apy: apy,
  url: 'https://app.ipor.io/pools',
};
