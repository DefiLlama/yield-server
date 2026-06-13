const sdk = require('@defillama/sdk');
const axios = require('axios');
const { getMerklRewardsByIdentifier } = require('../merkl/merkl-by-identifier');

const PUFETH = '0xD9A442856C234a39a81a089C06451EBAa4306a72';
const CONVERT_TO_ASSETS_ABI =
  'function convertToAssets(uint256 shares) view returns (uint256 assets)';

const getBlock = (timestamp) =>
  axios
    .get(`https://coins.llama.fi/block/ethereum/${timestamp}`, {
      timeout: 10_000,
    })
    .then((r) => r.data.height);

const apy = async () => {
  // Get current total supply of pufETH
  const totalSupply =
    (
      await sdk.api.abi.call({
        target: PUFETH,
        abi: 'erc20:totalSupply',
      })
    ).output / 1e18;

  const now = Math.floor(Date.now() / 1000);
  const timestamp7dayAgo = now - 86400 * 7;
  const timestamp30dayAgo = now - 86400 * 30;

  // Get historical block numbers
  const [block7dayAgo, block30dayAgo] = await Promise.all([
    getBlock(timestamp7dayAgo),
    getBlock(timestamp30dayAgo),
  ]);

  // Fetch exchange rates (convertToAssets for 1e18 shares) at current,
  // 7d ago, and 30d ago
  const ONE_SHARE = (1e18).toFixed(0);

  const [rateNow, rate7d, rate30d] = await Promise.all([
    sdk.api.abi.call({
      target: PUFETH,
      abi: CONVERT_TO_ASSETS_ABI,
      params: [ONE_SHARE],
    }),
    sdk.api.abi.call({
      target: PUFETH,
      abi: CONVERT_TO_ASSETS_ABI,
      params: [ONE_SHARE],
      block: block7dayAgo,
    }),
    sdk.api.abi.call({
      target: PUFETH,
      abi: CONVERT_TO_ASSETS_ABI,
      params: [ONE_SHARE],
      block: block30dayAgo,
    }),
  ]);

  // Calculate APY from rate changes (annualized)
  const rateNowNum = Number(rateNow.output);
  const rate7dNum = Number(rate7d.output);
  const rate30dNum = Number(rate30d.output);

  const apyBase =
    rate30dNum > 0
      ? ((rateNowNum - rate30dNum) / rate30dNum / 30) * 365 * 100
      : 0;
  const apyBase7d =
    rate7dNum > 0 ? ((rateNowNum - rate7dNum) / rate7dNum / 7) * 365 * 100 : 0;

  // Fetch pufETH price and Merkl rewards in parallel
  const priceKey = `ethereum:${PUFETH}`;
  const [priceRes, merklRewards] = await Promise.all([
    axios.get(`https://coins.llama.fi/prices/current/${priceKey}`, {
      timeout: 10_000,
    }),
    getMerklRewardsByIdentifier(PUFETH, 'ethereum'),
  ]);
  const price = priceRes.data.coins[priceKey]?.price;
  if (!Number.isFinite(price)) {
    throw new Error(`Missing/invalid price for ${priceKey}`);
  }

  const tvlUsd = totalSupply * price;

  const pool = {
    pool: PUFETH,
    chain: 'ethereum',
    project: 'puffer-stake',
    symbol: 'pufETH',
    tvlUsd,
    apyBase,
    apyBase7d,
    ...(rateNowNum / 1e18 > 0 && { pricePerShare: rateNowNum / 1e18 }),
    underlyingTokens: ['0x0000000000000000000000000000000000000000'],
    url: 'https://app.puffer.fi/stake',
    searchTokenOverride: PUFETH,
    isIntrinsicSource: true,
  };

  if (merklRewards?.apyReward > 0) {
    pool.apyReward = merklRewards.apyReward;
    pool.rewardTokens = merklRewards.rewardTokens;
  }

  return [pool];
};

module.exports = {
  apy,
  url: 'https://app.puffer.fi/stake',
};
