const sdk = require('@defillama/sdk');
const BigNumber = require('bignumber.js');
const utils = require('../utils');

const CHAIN = 'robinhood';
const CHAIN_NAME = 'Robinhood Chain';
const PROJECT = 'ripe-protocol';
const EARN_URL = 'https://app.ripe.finance/robinhood/earn';

const RIPE_GOV = '0xfa767a19c0c2b80d5a8d5b88be67de153df1b2f2';
const STABILITY_POOL = '0xe238b50d79d566aa59a2def4362a698edc3dc395';
const MISSION_CONTROL = '0xb05f928baa860ef4548aeb6cf7bb901e402bf8b6';
const PRICE_DESK = '0x56db9c2322e009189049bc57385751fc7922aab0';
const RIPE = '0x4d3f37a965b21ab4122e92dd41d2693e742c883b';
const GREEN = '0x355bb7f0f6c730e4460d620420a300fa08ff82f3';

const ONE_TOKEN = new BigNumber(10).pow(18);

// Robinhood Chain's block number approximates its parent-chain block number;
// one contract block is approximately 12 seconds.
const BLOCKS_PER_YEAR = (365 * 24 * 60 * 60) / 12;

const VAULT_ASSET_COUNT_ABI = 'uint256:getNumVaultAssets';
const VAULT_ASSET_ABI = 'function vaultAssets(uint256) view returns (address)';
const TOTAL_AMOUNT_ABI =
  'function getTotalAmountForVault(address) view returns (uint256)';
const REWARDS_CONFIG_ABI =
  'function getRewardsConfig() view returns (bool arePointsEnabled,uint256 ripePerBlock,uint256 borrowersAlloc,uint256 stakersAlloc,uint256 votersAlloc,uint256 genDepositorsAlloc,uint256 stakersPointsAllocTotal,uint256 voterPointsAllocTotal)';
const USD_VALUE_ABI =
  'function getUsdValue(address,uint256,bool) view returns (uint256)';
const ASSETS_URL = 'https://api.ripe.finance/api/ripe/assets?chain=robinhood';

const knownSymbols = {
  [RIPE]: 'RIPE',
  '0x2fd13b49f970e8c6d89283056c1c6281214b7eb6': 'GREEN/USDG',
  '0x290a52380a88f743813b8c3e9f6b0e61db5fdf73': 'sGREEN',
  '0x9b8537be0fd5cf9b2ad495c5a85130d5bae4769d': 'RIPE/NVDA LP',
};

async function getVaultAssets(vault) {
  const { output: countOutput } = await sdk.api.abi.multiCall({
    target: vault,
    abi: VAULT_ASSET_COUNT_ABI,
    calls: [{}],
    chain: CHAIN,
  });

  const { output: assets } = await sdk.api.abi.multiCall({
    target: vault,
    abi: VAULT_ASSET_ABI,
    calls: Array.from({ length: Number(countOutput[0].output) }, (_, i) => ({
      params: [i + 1],
    })),
    chain: CHAIN,
  });

  return assets.map(({ output }) => output);
}

async function getPriceDeskValue(asset) {
  const { output } = await sdk.api.abi.call({
    target: PRICE_DESK,
    abi: USD_VALUE_ABI,
    params: [asset, ONE_TOKEN.toFixed(0), false],
    chain: CHAIN,
  });
  return new BigNumber(output);
}

async function getLpPrice(asset, ripePrice) {
  const [token0, token1, reserves, totalSupply] = await Promise.all([
    sdk.api.abi.call({
      target: asset,
      abi: 'address:token0',
      chain: CHAIN,
    }),
    sdk.api.abi.call({
      target: asset,
      abi: 'address:token1',
      chain: CHAIN,
    }),
    sdk.api.abi.call({
      target: asset,
      abi: 'function getReserves() view returns (uint112,uint112,uint32)',
      chain: CHAIN,
    }),
    sdk.api.abi.call({
      target: asset,
      abi: 'uint256:totalSupply',
      chain: CHAIN,
    }),
  ]);

  const token0Address = token0.output.toLowerCase();
  const token1Address = token1.output.toLowerCase();
  const [token0Price, token1Price] = await Promise.all([
    token0Address === RIPE
      ? Promise.resolve(ripePrice)
      : getPriceDeskValue(token0Address),
    token1Address === RIPE
      ? Promise.resolve(ripePrice)
      : getPriceDeskValue(token1Address),
  ]);

  const [reserve0, reserve1] = reserves.output;
  const lpPrice = new BigNumber(reserve0)
    .times(token0Price)
    .plus(new BigNumber(reserve1).times(token1Price))
    .div(totalSupply.output);

  return { price: lpPrice, underlyingTokens: [token0Address, token1Address] };
}

async function getAssetPrice(asset, ripePrice) {
  if (asset === RIPE) return { price: ripePrice, underlyingTokens: [RIPE] };

  const price = await getPriceDeskValue(asset);
  if (!price.isZero()) return { price };

  return getLpPrice(asset, ripePrice);
}

async function getPool(
  vault,
  vaultId,
  asset,
  config,
  rewardsConfig,
  ripePrice
) {
  const [amount, assetPrice] = await Promise.all([
    sdk.api.abi.call({
      target: vault,
      abi: TOTAL_AMOUNT_ABI,
      params: [asset],
      chain: CHAIN,
    }),
    getAssetPrice(asset, ripePrice),
  ]);

  const amountRaw = new BigNumber(amount.output);
  const priceRaw = assetPrice.price;
  const tvlUsd = amountRaw.times(priceRaw).div(ONE_TOKEN.pow(2));
  if (amountRaw.isZero() || priceRaw.isZero() || tvlUsd.isZero()) return null;

  const totalRewardAllocation = new BigNumber(rewardsConfig.borrowersAlloc)
    .plus(rewardsConfig.stakersAlloc)
    .plus(rewardsConfig.votersAlloc)
    .plus(rewardsConfig.genDepositorsAlloc);
  const annualReward = new BigNumber(rewardsConfig.ripePerBlock)
    .times(BLOCKS_PER_YEAR)
    .times(rewardsConfig.stakersAlloc)
    .div(totalRewardAllocation)
    .times(config.stakersPointsAlloc)
    .div(rewardsConfig.stakersPointsAllocTotal);
  const apyReward = annualReward
    .times(ripePrice)
    .div(ONE_TOKEN.pow(2))
    .div(tvlUsd)
    .times(100);

  const pool = {
    pool: `${asset}-${vaultId}-${CHAIN}`.toLowerCase(),
    chain: CHAIN_NAME,
    project: PROJECT,
    symbol: knownSymbols[asset] || asset,
    tvlUsd: tvlUsd.toNumber(),
    apyReward: apyReward.toNumber(),
    rewardTokens: [RIPE],
    token: asset,
    poolMeta: vaultId === 2 ? 'RipeGov' : 'StabilityPool',
    url: EARN_URL,
  };

  if (assetPrice.underlyingTokens)
    pool.underlyingTokens = assetPrice.underlyingTokens;
  else if (asset === '0x290a52380a88f743813b8c3e9f6b0e61db5fdf73') {
    pool.underlyingTokens = [GREEN];
  }

  return pool;
}

async function apy() {
  const [ripePriceData, rewardsConfig, assetsResponse] = await Promise.all([
    utils.getPrices([RIPE], CHAIN),
    sdk.api.abi.call({
      target: MISSION_CONTROL,
      abi: REWARDS_CONFIG_ABI,
      chain: CHAIN,
    }),
    utils.withRetry(() => utils.getData(ASSETS_URL)),
  ]);
  const ripePrice = new BigNumber(ripePriceData.pricesByAddress[RIPE]);
  const rewards = rewardsConfig.output;
  const assetConfigs = new Map(
    assetsResponse.result.map((asset) => [
      `${asset.tokenAddress.toLowerCase()}-${asset.vaultId}`,
      asset,
    ])
  );

  if (
    !rewards.arePointsEnabled ||
    new BigNumber(rewards.stakersPointsAllocTotal).isZero()
  ) {
    return [];
  }

  const vaults = [
    { address: RIPE_GOV, id: 2 },
    { address: STABILITY_POOL, id: 1 },
  ];
  const pools = [];

  for (const vault of vaults) {
    const assets = await getVaultAssets(vault.address);
    for (const asset of assets) {
      const assetConfig = assetConfigs.get(
        `${asset.toLowerCase()}-${vault.id}`
      );
      if (
        !assetConfig ||
        new BigNumber(assetConfig.stakersPointsAlloc).isZero()
      )
        continue;

      const pool = await getPool(
        vault.address,
        vault.id,
        asset.toLowerCase(),
        assetConfig,
        rewards,
        ripePrice.times(ONE_TOKEN)
      );
      if (pool) pools.push(pool);
    }
  }

  return pools;
}

module.exports = {
  protocolId: '7342',
  timetravel: false,
  apy,
  url: EARN_URL,
};
