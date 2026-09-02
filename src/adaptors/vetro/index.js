const sdk = require('@defillama/sdk');
const utils = require('../utils');

// Contract Addresses
const VUSD = '0xCa83DDE9c22254f58e771bE5E157773212AcBAc3';
const SVUSD_VAULT = '0x476310E34D2810f7d79C43A74E4D79405bd7a925';
const VUSD_YIELD_DISTRIBUTOR = '0x55745265Ba172378cf45d224F09F0673cB470cef';

const VETBTC = '0xf196C68233464A16CFDa319a47c21f4cECa62001';
const SVETBTC_VAULT = '0x0cB9D84d4bcEc8d3D5B2d99a6F07f4605325987e';
const VETBTC_YIELD_DISTRIBUTOR = '0xd74bcf1299176E98899bA2e86dD2C9aE089F5276';

const SECONDS_PER_YEAR = 31536000n;

const apy = async () => {
  const now = BigInt(Math.floor(Date.now() / 1000));

  // --- 1. Compute sVUSD Live Yield ---
  const svusdTotalAssets = (
    await sdk.api.abi.call({
      target: SVUSD_VAULT,
      abi: 'function totalAssets() view returns (uint256)',
      chain: 'ethereum',
    })
  ).output;

  const vusdRewardRate = (
    await sdk.api.abi.call({
      target: VUSD_YIELD_DISTRIBUTOR,
      abi: 'function rewardRate() view returns (uint256)',
      chain: 'ethereum',
    })
  ).output;

  const vusdPeriodFinish = (
    await sdk.api.abi.call({
      target: VUSD_YIELD_DISTRIBUTOR,
      abi: 'function periodFinish() view returns (uint256)',
      chain: 'ethereum',
    })
  ).output;

  let svusdApy = 0;
  if (BigInt(vusdPeriodFinish) > now && BigInt(svusdTotalAssets) > 0n) {
    const annualRewardsWei = Number(BigInt(vusdRewardRate) * SECONDS_PER_YEAR) / 1e18;
    svusdApy = (annualRewardsWei / Number(svusdTotalAssets)) * 100;
  }

  // --- 2. Compute svetBTC Live Yield ---
  const svetbtcTotalAssets = (
    await sdk.api.abi.call({
      target: SVETBTC_VAULT,
      abi: 'function totalAssets() view returns (uint256)',
      chain: 'ethereum',
    })
  ).output;

  const vetbtcRewardRate = (
    await sdk.api.abi.call({
      target: VETBTC_YIELD_DISTRIBUTOR,
      abi: 'function rewardRate() view returns (uint256)',
      chain: 'ethereum',
    })
  ).output;

  const vetbtcPeriodFinish = (
    await sdk.api.abi.call({
      target: VETBTC_YIELD_DISTRIBUTOR,
      abi: 'function periodFinish() view returns (uint256)',
      chain: 'ethereum',
    })
  ).output;

  let svetbtcApy = 0;
  if (BigInt(vetbtcPeriodFinish) > now && BigInt(svetbtcTotalAssets) > 0n) {
    const annualRewardsWei = Number(BigInt(vetbtcRewardRate) * SECONDS_PER_YEAR) / 1e18;
    svetbtcApy = (annualRewardsWei / Number(svetbtcTotalAssets)) * 100;
  }

  // --- 3. Price Fetching via DefiLlama Utils ---
  const vetBtcKey = `ethereum:${VETBTC}`;
  const coins = await utils.getPrices([vetBtcKey, 'coingecko:bitcoin']);
  const btcPrice =
    coins.pricesByAddress[VETBTC.toLowerCase()] ||
    coins.pricesByAddress['bitcoin'] ||
    0;

  return [
    {
      pool: `${SVUSD_VAULT}-ethereum`.toLowerCase(),
      chain: 'Ethereum',
      project: 'vetro',
      symbol: 'sVUSD',
      tvlUsd: Number(svusdTotalAssets) / 1e18,
      apyBase: Number(svusdApy.toFixed(2)),
      underlyingTokens: [VUSD],
      token: SVUSD_VAULT,
      url: 'https://app.vetro.org/en/earn',
    },
    {
      pool: `${SVETBTC_VAULT}-ethereum`.toLowerCase(),
      chain: 'Ethereum',
      project: 'vetro',
      symbol: 'svetBTC',
      tvlUsd: (Number(svetbtcTotalAssets) / 1e18) * btcPrice,
      apyBase: Number(svetbtcApy.toFixed(2)),
      underlyingTokens: [VETBTC],
      token: SVETBTC_VAULT,
      url: 'https://app.vetro.org/en/earn',
    },
  ];
};

module.exports = {
  protocolId: '8528',
  timetravel: false,
  apy,
  url: 'https://vetro.org',
};
