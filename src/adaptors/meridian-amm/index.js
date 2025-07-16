const utils = require('../utils');

const meridianAddress =
  '0xfbdb3da73efcfa742d542f152d65fc6da7b55dee864cd66475213e4be18c9d54';
const MERIDIAN_DAPP_URL = 'https://app.meridian.money';
const MERIDIAN_POOL_API_URL = `${MERIDIAN_DAPP_URL}/api/liquidity-pool`;
const MERIDIAN_COIN_INFO_URL = `${MERIDIAN_DAPP_URL}/api/coin-info`;

const coinInfoCache = {};

async function main() {
  // We use Meridian's API and not resources on chain as there are too many pools to parse and query
  // for TVL, APR, etc. metrics. This way we fetch all our pools with TVL attached, then can filter.
  const liquidityPools = (await utils.getData(`${MERIDIAN_POOL_API_URL}s`))
      ?.data;
  if (!liquidityPools) {
    return [];
  }
  const filteredPools = liquidityPools.filter((pool) => pool.tvl > 10000);
  const v2Pools = filteredPools.filter((pool) => pool.metadata.isV2 === true);

  const tvlArr = [];
  for (const liquidityPool of v2Pools) {
    const swapFeesApr = liquidityPool.apr.find(item => item.source === 'Swap Fees')?.apr;
    const farmingMOVEApr = liquidityPool.apr.find(item => item.source === 'MOVE')?.apr;
    const rewardTokens = [];

    // Check and push for MOVE
    if (farmingMOVEApr > 0) {
      rewardTokens.push('0x1::aptos_coin::AptosCoin');
    }

    const coinInfos = await Promise.all(liquidityPool.metadata.coinAddresses.map(async (address) => await getCoinInfoWithCache(address)));
    const coinNames = coinInfos.map((coinInfo) => coinInfo.symbol).join('-');
    tvlArr.push({
      pool:
        liquidityPool.metadata.type + '-move',
      chain: utils.formatChain('move'),
      project: 'meridian-amm',
      apyBase: (swapFeesApr ?? 0) * 100,
      apyReward: (farmingMOVEApr ?? 0) * 100,
      rewardTokens,
      symbol: coinNames,
      tvlUsd: liquidityPool.tvl,
      volumeUsd1d: +liquidityPool.volume1d,
      underlyingTokens: liquidityPool.metadata.coinAddresses,
      url: `${MERIDIAN_DAPP_URL}/pools/${liquidityPool.metadata.type}`,
    });
  }

  return tvlArr;
}

async function getCoinInfoWithCache(coinAddress) {
  if (coinInfoCache[coinAddress]) {
    return coinInfoCache[coinAddress];
  }
  
  const coinInfo = await utils.getData(`${MERIDIAN_COIN_INFO_URL}?coin=${coinAddress}`);
  coinInfoCache[coinAddress] = coinInfo?.data;

  return coinInfo?.data;
}

module.exports = {
  timetravel: false,
  apy: main,
  url: `${MERIDIAN_DAPP_URL}/pools`,
};
