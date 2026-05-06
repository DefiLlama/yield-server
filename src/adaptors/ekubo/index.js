const utils = require('../utils');
const { chunk } = require('lodash');

const API_URL = 'https://prod-api.ekubo.org';
const ETHEREUM_CHAIN_ID = '0x1';
const STARKNET_CHAIN_ID = '0x534e5f4d41494e';
const MIN_TVL_USD = 10000;
const TOP_POOL_REQUEST_CONCURRENCY = 5;
const MAX_TOP_POOL_FAILURES = 3;
const Q128 = 1n << 128n;
const Q64 = 1n << 64n;

const LEGACY_STARKNET_POOL_IDS_BY_CANONICAL_ID = {
  'ekubo-0x534e5f4d41494e-0x5dd3d2f4429af886cd1a3b08289dbcea99a294197e9eb43b0e0325b4b-0x01002120c2f49c83a9d777123a4061cd371cfc24fb40cddd9bd8450ce3f464ac':
    'ekubo-USDC-STRK',
  'ekubo-0x534e5f4d41494e-0x5dd3d2f4429af886cd1a3b08289dbcea99a294197e9eb43b0e0325b4b-0x04bd20b29abca6ff1c0700b3d895ea9f0e3b72ed877056c246434dde1107202f':
    'ekubo-WBTC-ETH',
  'ekubo-0x534e5f4d41494e-0x5dd3d2f4429af886cd1a3b08289dbcea99a294197e9eb43b0e0325b4b-0x0693eaeeedf35efecf73c368883e4c0a1daa5ec9050b0660c92b3ef4c932ef03':
    'ekubo-USDC-DAI',
  'ekubo-0x534e5f4d41494e-0x5dd3d2f4429af886cd1a3b08289dbcea99a294197e9eb43b0e0325b4b-0x15d72ccf4bdff86d1ddfbd5151f46e29cdd3d9cec3b3c153f1f285105a561971':
    'ekubo-CASH-USDC.e',
  'ekubo-0x534e5f4d41494e-0x5dd3d2f4429af886cd1a3b08289dbcea99a294197e9eb43b0e0325b4b-0x17839b8e7d675364fb142be291dcbb674fe31dcb6708e6b618e4af27c44e93b8':
    'ekubo-STRK-USDC.e',
  'ekubo-0x534e5f4d41494e-0x5dd3d2f4429af886cd1a3b08289dbcea99a294197e9eb43b0e0325b4b-0x194d4157fb05a85a90dc85641430b6636f1fbbe7676a63e01b0b46471ab98461':
    'ekubo-USDC-EKUBO',
  'ekubo-0x534e5f4d41494e-0x5dd3d2f4429af886cd1a3b08289dbcea99a294197e9eb43b0e0325b4b-0x1f9b00d35db8e5eb3342ae21249a0b6703843b275a25c3b88a8adf805f22b85c':
    'ekubo-USN-USDC',
  'ekubo-0x534e5f4d41494e-0x5dd3d2f4429af886cd1a3b08289dbcea99a294197e9eb43b0e0325b4b-0x1fe0cd3ecbf2ddeafa6f756439847222f50be66568735995dd6b3cc8d8d494ad':
    'ekubo-WBTC-xLBTC',
  'ekubo-0x534e5f4d41494e-0x5dd3d2f4429af886cd1a3b08289dbcea99a294197e9eb43b0e0325b4b-0x26936e9da968773da0e54a987f7a983079f1892e4e6c24061e6cee802079c5bf':
    'ekubo-8-ETH',
  'ekubo-0x534e5f4d41494e-0x5dd3d2f4429af886cd1a3b08289dbcea99a294197e9eb43b0e0325b4b-0x31fbfb43b9d590831f003e88ba4fc4e3e487e9ab1f9f08d9ed5844a127d4f014':
    'ekubo-USDC.e-USDT',
  'ekubo-0x534e5f4d41494e-0x5dd3d2f4429af886cd1a3b08289dbcea99a294197e9eb43b0e0325b4b-0x376f6e44f63b7e961474e891554e9cea0c63156f4975861bd7ba756990534553':
    'ekubo-xSTRK-STRK',
  'ekubo-0x534e5f4d41494e-0x5dd3d2f4429af886cd1a3b08289dbcea99a294197e9eb43b0e0325b4b-0x38713917fafeeaad6a918d2ad8a6853d842e652a1b3db0842fb163a19feeeed3':
    'ekubo-USDC-AUSD0',
  'ekubo-0x534e5f4d41494e-0x5dd3d2f4429af886cd1a3b08289dbcea99a294197e9eb43b0e0325b4b-0x3a4b8d9f8aab33238b31fcd0cb253f8398e871f874f8fb5f63fdd70dd2f432fc':
    'ekubo-STRK-ETH',
  'ekubo-0x534e5f4d41494e-0x5dd3d2f4429af886cd1a3b08289dbcea99a294197e9eb43b0e0325b4b-0x3b4126d142d97af918060d7f5c39408b464b9de9ea7493e4539574626a397b91':
    'ekubo-USN-sUSN',
  'ekubo-0x534e5f4d41494e-0x5dd3d2f4429af886cd1a3b08289dbcea99a294197e9eb43b0e0325b4b-0x467c07120e38e2bfd36f0fdc92ce26721ff30da213191da9056cfe32df36a5cf':
    'ekubo-USDC-mRe7YIELD',
  'ekubo-0x534e5f4d41494e-0x5dd3d2f4429af886cd1a3b08289dbcea99a294197e9eb43b0e0325b4b-0x52470731599ed711c592e8cc920f20cd60e7c6fed3fe038fabc446b4d7e8cbf5':
    'ekubo-USDC-ETH',
  'ekubo-0x534e5f4d41494e-0x5dd3d2f4429af886cd1a3b08289dbcea99a294197e9eb43b0e0325b4b-0x52981712797a9298182b6e61939b909876bae205c56c7e0ab83cb3272f0525dd':
    'ekubo-STRK-EKUBO',
  'ekubo-0x534e5f4d41494e-0x5dd3d2f4429af886cd1a3b08289dbcea99a294197e9eb43b0e0325b4b-0x54686efad5a90e247d0605073ef77eabc4c438a8e89f115ec0170ebdbba9c8ff':
    'ekubo-xsBTC-SolvBTC',
  'ekubo-0x534e5f4d41494e-0x5dd3d2f4429af886cd1a3b08289dbcea99a294197e9eb43b0e0325b4b-0x556c426c241ec248d3e33df4b6540cc498a144df8afafdb7da8d078a33d9169c':
    'ekubo-WBTC-USDC.e',
  'ekubo-0x534e5f4d41494e-0x5dd3d2f4429af886cd1a3b08289dbcea99a294197e9eb43b0e0325b4b-0x565aa56471cbaacd1a650ea4f76699c43a2e2a72bb74f93b82f37dc8ddb2cce4':
    'ekubo-SURVIVOR-STRK',
  'ekubo-0x534e5f4d41494e-0x5dd3d2f4429af886cd1a3b08289dbcea99a294197e9eb43b0e0325b4b-0x5be56eda4c57869fe0b48633fda07b8ce465980437ccfe82c70c8cc0bf764214':
    'ekubo-USDC.e-EKUBO',
  'ekubo-0x534e5f4d41494e-0x5dd3d2f4429af886cd1a3b08289dbcea99a294197e9eb43b0e0325b4b-0x5e1e3b2f0439053e97eb577f81a261a5d1f37e9c69bb97c1813c6af7100eea6e':
    'ekubo-LORDS-SURVIVOR',
  'ekubo-0x534e5f4d41494e-0x5dd3d2f4429af886cd1a3b08289dbcea99a294197e9eb43b0e0325b4b-0x73ee5f68f9b286b9d6e313a238562e60271f382deaa1a45c440493e8683e8537':
    'ekubo-wstETH-ETH',
  'ekubo-0x534e5f4d41494e-0x5dd3d2f4429af886cd1a3b08289dbcea99a294197e9eb43b0e0325b4b-0x7410dec25dad3bc42f4858f1f604fe7fe36620d5c654d3521fa7775b45ac31a9':
    'ekubo-LORDS-ETH',
  'ekubo-0x534e5f4d41494e-0x5dd3d2f4429af886cd1a3b08289dbcea99a294197e9eb43b0e0325b4b-0x78beceafa229e347bb0911ae7f4755f4f84134d0e2e82c3361f5379fd4663c1d':
    'ekubo-SCHIZODIO-STRK',
  'ekubo-0x534e5f4d41494e-0x5dd3d2f4429af886cd1a3b08289dbcea99a294197e9eb43b0e0325b4b-0x7c00aa8dc6c87913cdfed522bdca6337c220d3bc5449cd237e5f640688c11304':
    'ekubo-USDC-SURVIVOR',
  'ekubo-0x534e5f4d41494e-0x5dd3d2f4429af886cd1a3b08289dbcea99a294197e9eb43b0e0325b4b-0x7c979795d689cf92b78bf87de7a3f716d7d5db944faecbc8fbed7fbac51176c2':
    'ekubo-ETH-EKUBO',
  'ekubo-0x534e5f4d41494e-0x5dd3d2f4429af886cd1a3b08289dbcea99a294197e9eb43b0e0325b4b-0x89d738e388c336beb0a2a77c1b43664508cb64e89fdba0beab8d609d53c93502':
    'ekubo-DOG-STRK',
  'ekubo-0x534e5f4d41494e-0x5dd3d2f4429af886cd1a3b08289dbcea99a294197e9eb43b0e0325b4b-0x8b79c7524ce7d907d3a9063cf4e4f8fd76e959b227bf70aaea119def07a732fb':
    'ekubo-USDC-WBTC',
  'ekubo-0x534e5f4d41494e-0x5dd3d2f4429af886cd1a3b08289dbcea99a294197e9eb43b0e0325b4b-0x8d561524eb50808a2f84722d6b77985e3cb3371a60fd9b9f0ad85b1af7f9267e':
    'ekubo-LBTC-WBTC',
  'ekubo-0x534e5f4d41494e-0x5dd3d2f4429af886cd1a3b08289dbcea99a294197e9eb43b0e0325b4b-0x9bb1515d35dd4976007c71da3c6cd52d9a4ee8c9d8883b7d8dd89b5c46b03d61':
    'ekubo-USDC-CASH',
  'ekubo-0x534e5f4d41494e-0x5dd3d2f4429af886cd1a3b08289dbcea99a294197e9eb43b0e0325b4b-0xac27cba5a957e2463c54f1a45d6d4cadd38a78b145f21e91ff9c8f1769150955':
    'ekubo-wstETH-legacy-ETH',
  'ekubo-0x534e5f4d41494e-0x5dd3d2f4429af886cd1a3b08289dbcea99a294197e9eb43b0e0325b4b-0xadbdc21df61348d6012fba0f8d157fa4cada00967ec0590ed675ee4eebc160cb':
    'ekubo-USDC-USDC.e',
  'ekubo-0x534e5f4d41494e-0x5dd3d2f4429af886cd1a3b08289dbcea99a294197e9eb43b0e0325b4b-0xb4f18aadb1590e54b9d813342f8ed4d07f0c2313ce31c2e2c16942b8165ab9b7':
    'ekubo-ETH-USDC.e',
  'ekubo-0x534e5f4d41494e-0x5dd3d2f4429af886cd1a3b08289dbcea99a294197e9eb43b0e0325b4b-0xc8540dd0394471c7279d59c8487db44907fbf0eab5ba0fc68c6defdd1715967f':
    'ekubo-USDC-USDT',
  'ekubo-0x534e5f4d41494e-0x5dd3d2f4429af886cd1a3b08289dbcea99a294197e9eb43b0e0325b4b-0xca0357c00d4752887fe0cfd4e109151d7375c378afc8fe4aa083baf6b7ffc0a3':
    'ekubo-WBTC-xWBTC',
  'ekubo-0x534e5f4d41494e-0x5dd3d2f4429af886cd1a3b08289dbcea99a294197e9eb43b0e0325b4b-0xcb119b1f3e367e7e62a8ad2bf2b80a1e05e61bf878bde8032f45267762297061':
    'ekubo-ETH-USDT',
  'ekubo-0x534e5f4d41494e-0x5dd3d2f4429af886cd1a3b08289dbcea99a294197e9eb43b0e0325b4b-0xd746bebe15752f616bee3310b798c2301f110b6975f0bc53fe490cf7d9ce16b2':
    'ekubo-WBTC-tBTC',
  'ekubo-0x534e5f4d41494e-0x5dd3d2f4429af886cd1a3b08289dbcea99a294197e9eb43b0e0325b4b-0xd9034db096ae22283af019562b3f82caae5497f900b6a9602ce3d6a1e791820c':
    'ekubo-USDC.e-DAI',
  'ekubo-0x534e5f4d41494e-0x5dd3d2f4429af886cd1a3b08289dbcea99a294197e9eb43b0e0325b4b-0xd936751f14407aac9d2e859ef5d2cec5e170f1555c7b703eba9357efb6c01e95':
    'ekubo-DAIv0-ETH',
  'ekubo-0x534e5f4d41494e-0x5dd3d2f4429af886cd1a3b08289dbcea99a294197e9eb43b0e0325b4b-0xda33e5392af9e21809d2876e2738831e86978934de45df5a6caf0b940df3fbb6':
    'ekubo-WBTC-STRK',
  'ekubo-0x534e5f4d41494e-0x5dd3d2f4429af886cd1a3b08289dbcea99a294197e9eb43b0e0325b4b-0xea68dd618feb9f58544a89d24f5acc957863abdc32e798052700117b1943b996':
    'ekubo-NUMS-USDC',
  'ekubo-0x534e5f4d41494e-0x5dd3d2f4429af886cd1a3b08289dbcea99a294197e9eb43b0e0325b4b-0xf1e88f6316dd7597091bc3546a116a4e86cac039be8026b2af9549f1e1c9ca3b':
    'ekubo-xtBTC-tBTC',
  'ekubo-0x534e5f4d41494e-0x5dd3d2f4429af886cd1a3b08289dbcea99a294197e9eb43b0e0325b4b-0xfa0bdc11a2ef6646cfb497f4abefd058eeaddbf7bb5db08f4f554e228a15e118':
    'ekubo-WBTC-SolvBTC',
};

function normalizeChainId(chainId) {
  return BigInt(chainId).toString();
}

const CHAINS = [
  {
    chainId: ETHEREUM_CHAIN_ID,
    normalizedChainId: normalizeChainId(ETHEREUM_CHAIN_ID),
    chain: 'ethereum',
  },
  {
    chainId: STARKNET_CHAIN_ID,
    normalizedChainId: normalizeChainId(STARKNET_CHAIN_ID),
    chain: 'starknet',
  },
];

function normalizeTokenRef(chainId, address) {
  return `${normalizeChainId(chainId)}:${BigInt(address).toString()}`;
}

function getPairKey(chainId, tokenA, tokenB) {
  const [token0, token1] = [
    normalizeTokenRef(chainId, tokenA),
    normalizeTokenRef(chainId, tokenB),
  ].sort();

  return `${token0}:${token1}`;
}

function getLegacyPoolId(chainId, canonicalPoolId) {
  if (normalizeChainId(chainId) === normalizeChainId(STARKNET_CHAIN_ID)) {
    return LEGACY_STARKNET_POOL_IDS_BY_CANONICAL_ID[canonicalPoolId] ?? null;
  }

  return null;
}

function getCanonicalPoolId(chainId, poolInfo) {
  return `ekubo-${formatNumericHex(chainId)}-${formatNumericHex(
    poolInfo.core_address
  )}-${formatNumericHex(poolInfo.pool_id, 64)}`.toLowerCase();
}

function getPoolId(chainId, poolInfo) {
  const canonicalPoolId = getCanonicalPoolId(chainId, poolInfo);

  return getLegacyPoolId(chainId, canonicalPoolId) ?? canonicalPoolId;
}

function formatNumericHex(value, size = null) {
  if (typeof value === 'string' && value.startsWith('0x')) {
    const hex = value.slice(2).toLowerCase();
    return `0x${size ? hex.padStart(size, '0') : hex}`;
  }

  const hex = BigInt(value).toString(16);
  return `0x${size ? hex.padStart(size, '0') : hex}`;
}

function getPoolUrl(chainId, poolInfo) {
  const chainPath =
    normalizeChainId(chainId) === normalizeChainId(STARKNET_CHAIN_ID)
      ? 'starknet'
      : 'evm';

  return `https://ekubo.org/${chainPath}/charts/pool/${chainId}/${formatNumericHex(
    poolInfo.core_address
  )}/${formatNumericHex(poolInfo.pool_id, 64)}`;
}

function formatFeePercent(chainId, fee) {
  if (fee == null) return null;

  const denominator =
    normalizeChainId(chainId) === normalizeChainId(STARKNET_CHAIN_ID)
      ? Q128
      : Q64;
  const scaledPercent =
    (BigInt(fee) * 10000n + denominator / 2n) / denominator;
  const whole = scaledPercent / 100n;
  const fraction = (scaledPercent % 100n).toString().padStart(2, '0');

  return `${whole.toString()}.${fraction}% fee`;
}

function formatDepthPercent(depthPercent) {
  if (depthPercent == null) return null;

  return `CL range ${((depthPercent || 0) * 100).toFixed(2)}%`;
}

function getPoolMeta(chainId, poolInfo) {
  const parts = [
    formatFeePercent(chainId, poolInfo.fee),
    formatDepthPercent(poolInfo.depth_percent),
  ].filter(Boolean);

  return parts.length ? parts.join(' | ') : null;
}

function formatTokenAddress(chainId, address) {
  if (normalizeChainId(chainId) === normalizeChainId(STARKNET_CHAIN_ID)) {
    return utils.padStarknetAddress(address);
  }

  return utils.formatAddress(address);
}

function getAmountUsd(token, amount) {
  if (!token?.usd_price) return 0;

  return (
    (token.usd_price * Number(amount || 0)) / Math.pow(10, Number(token.decimals))
  );
}

function getLiquidityUsd(token0, token1, amount0, amount1) {
  return getAmountUsd(token0, amount0) + getAmountUsd(token1, amount1);
}

function isCampaignActive(campaign, now) {
  const startTime = new Date(campaign.startTime).getTime();
  const endTime = campaign.endTime ? new Date(campaign.endTime).getTime() : Infinity;

  return startTime <= now && now < endTime;
}

function buildCampaignRewards(campaigns, tokenByKey) {
  const now = Date.now();
  const rewardsByPair = new Map();

  for (const campaign of campaigns) {
    if (!isCampaignActive(campaign, now)) continue;

    const rewardToken = tokenByKey[normalizeTokenRef(campaign.chain_id, campaign.rewardToken)];
    if (!rewardToken?.usd_price) continue;

    for (const pair of campaign.pairs) {
      const dailyRewardUsd = getAmountUsd(rewardToken, pair.daily_rewards);
      if (!dailyRewardUsd) continue;

      const depthUsd =
        getAmountUsd(
          tokenByKey[normalizeTokenRef(campaign.chain_id, pair.token0)],
          pair.depth0
        ) +
        getAmountUsd(
          tokenByKey[normalizeTokenRef(campaign.chain_id, pair.token1)],
          pair.depth1
        );

      if (!depthUsd) continue;

      const pairKey = getPairKey(campaign.chain_id, pair.token0, pair.token1);
      const existing = rewardsByPair.get(pairKey) || {
        apyReward: 0,
        rewardTokens: new Set(),
      };

      existing.apyReward += (dailyRewardUsd * 365 * 100) / depthUsd;
      existing.rewardTokens.add(
        formatTokenAddress(campaign.chain_id, rewardToken.address)
      );
      rewardsByPair.set(pairKey, existing);
    }
  }

  return rewardsByPair;
}

async function getChainData({ normalizedChainId }) {
  const query = `chainId=${encodeURIComponent(normalizedChainId)}`;

  const [tokens, pairData, campaigns] = await Promise.all([
    utils.getData(`${API_URL}/tokens?${query}&pageSize=10000`),
    utils.getData(`${API_URL}/overview/pairs?${query}&minTvlUsd=${MIN_TVL_USD}`),
    utils.getData(`${API_URL}/campaigns?${query}`),
  ]);

  const topPoolEntries = [];
  let topPoolFailureCount = 0;
  for (const pairsBatch of chunk(pairData.topPairs, TOP_POOL_REQUEST_CONCURRENCY)) {
    const batchEntries = await Promise.all(
      pairsBatch.map(async (pair) => {
        const pairKey = getPairKey(pair.chain_id, pair.token0, pair.token1);
        try {
          const pools = await utils.getData(
            `${API_URL}/pair/${encodeURIComponent(normalizedChainId)}/${encodeURIComponent(
              pair.token0
            )}/${encodeURIComponent(pair.token1)}/pools?minTvlUsd=${MIN_TVL_USD}`
          );
          const topPools = pools?.topPools || [];
          if (topPools.length === 0) return null;

          return [
            pairKey,
            topPools,
          ];
        } catch (error) {
          console.error(
            `Ekubo top pool fetch failed for chain ${normalizedChainId} pair ${pairKey}: ${error.message}`
          );
          return { error: true, pairKey };
        }
      })
    );
    const failedEntries = batchEntries.filter((entry) => entry?.error);
    topPoolFailureCount += failedEntries.length;

    if (topPoolFailureCount > MAX_TOP_POOL_FAILURES) {
      throw new Error(
        `Ekubo top pool fetch failures exceeded threshold for chain ${normalizedChainId}: ${topPoolFailureCount}`
      );
    }

    topPoolEntries.push(
      ...batchEntries.filter((entry) => entry && !entry.error)
    );
  }

  return {
    tokens,
    pairs: pairData.topPairs,
    topPoolsByPair: new Map(topPoolEntries.filter(([, pools]) => pools?.length)),
    campaigns: campaigns.campaigns,
  };
}

async function apy() {
  const results = await Promise.all(CHAINS.map(getChainData));
  const tokens = results.flatMap((result) => result.tokens);
  const topPoolsByPair = new Map(
    results.flatMap((result) => [...result.topPoolsByPair.entries()])
  );
  const tokenByAddr = {};
  for (const token of tokens) {
    tokenByAddr[normalizeTokenRef(token.chain_id, token.address)] = token;
  }

  const campaignRewards = buildCampaignRewards(
    results.flatMap((result) => result.campaigns),
    tokenByAddr
  );

  return results
    .flatMap((result) => result.pairs)
    .map((p) => {
      const chainId = p.chain_id;
      const t0Key = normalizeTokenRef(chainId, p.token0);
      const t1Key = normalizeTokenRef(chainId, p.token1);
      const token0 = tokenByAddr[t0Key];
      const token1 = tokenByAddr[t1Key];
      if (!token0 || !token1) return;
      const campaignReward =
        campaignRewards.get(getPairKey(chainId, p.token0, p.token1)) || null;
      const topPools = topPoolsByPair.get(getPairKey(chainId, p.token0, p.token1));

      if (!topPools?.length) return [];

      return topPools
        .map((topPool) => {
          const tvlUsd = getLiquidityUsd(
            token0,
            token1,
            topPool.tvl0_total,
            topPool.tvl1_total
          );

          if (tvlUsd < MIN_TVL_USD) return null;

          const feesUsd = getLiquidityUsd(
            token0,
            token1,
            topPool.fees0_24h,
            topPool.fees1_24h
          );
          const depthUsd = getLiquidityUsd(
            token0,
            token1,
            topPool.depth0,
            topPool.depth1
          );

          const apyBase = (feesUsd * 100 * 365) / (depthUsd || tvlUsd);

          return {
            pool: getPoolId(chainId, topPool),
            chain: utils.formatChain(
              CHAINS.find(
                (chain) => chain.normalizedChainId === normalizeChainId(chainId)
              )?.chain ?? chainId
            ),
            project: 'ekubo',
            symbol: `${token0.symbol}-${token1.symbol}`,
            underlyingTokens: [
              formatTokenAddress(chainId, token0.address),
              formatTokenAddress(chainId, token1.address),
            ],
            tvlUsd,
            apyBase,
            apyReward: campaignReward?.apyReward || 0,
            rewardTokens: campaignReward ? [...campaignReward.rewardTokens] : [],
            poolMeta: getPoolMeta(chainId, topPool),
            url: getPoolUrl(chainId, topPool),
          };
        })
        .filter(Boolean);
    })
    .flat()
    .filter((p) => p && utils.keepFinite(p))
    .sort((a, b) => b.tvlUsd - a.tvlUsd);
}

module.exports = {
  timetravel: false,
  apy,
  url: 'https://app.ekubo.org/charts',
};
