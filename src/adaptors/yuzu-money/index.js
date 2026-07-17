const sdk = require('@defillama/sdk');
const utils = require('../utils');
const axios = require('axios');

// Constants
// Plasma must remain first — calculateTvlByToken assumes index 0 is the home chain.
const CHAINS = ['plasma', 'ethereum', 'monad', 'hyperliquid', 'sei'];
const UNIT = 1e18;
const YEAR_IN_DAYS = 365;
const DAY_IN_SECONDS = 24 * 60 * 60;
const APY_REFERENCE_PERIOD_IN_DAYS = 7;

const USDT_UNIT = 1e6;
const USDC_UNIT = 1e6;

const yuzuConfig = {
  plasma: {
    usdt: '0xB8CE59FC3717ada4C02eaDF9682A9e934F625ebb',
    yzUSD: { address: '0x6695c0f8706c5ace3bdf8995073179cca47926dc', unit: UNIT },
    syzUSD: { address: '0xc8a8df9b210243c55d31c73090f06787ad0a1bf6', unit: UNIT },
    yzPP: { address: '0xEbFC8C2Fe73C431Ef2A371AeA9132110aaB50DCa', unit: UNIT },
  },
  ethereum: {
    usdt: '0xdac17f958d2ee523a2206206994597c13d831ec7',
    usdc: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
    yzUSD: { address: '0x387167e5C088468906Bcd67C06746409a8E44abA', unit: UNIT },
    syzUSD: { address: '0x6DFF69eb720986E98Bb3E8b26cb9E02Ec1a35D12', unit: UNIT },
    yzPP: { address: '0xB2429bA2cfa6387C9A336Da127d34480C069F851', unit: UNIT },
    yzCash: { address: '0x224e90591A2d63fb66E677D0561Ea4A6Ad1F098D', unit: UNIT },
  },
  monad: {
    usdt: '0xe7cd86e13ac4309349f30b3435a9d337750fc82d',
    usdc: '0x754704Bc059F8C67012fEd69BC8A327a5aafb603',
    yzUSD: { address: '0x9dcB0D17eDDE04D27F387c89fECb78654C373858', unit: UNIT },
    syzUSD: { address: '0x484be0540aD49f351eaa04eeB35dF0f937D4E73f', unit: UNIT },
    yzPP: { address: '0xb37476cB1F6111cC682b107B747b8652f90B0984', unit: UNIT },
    yzPrime: { address: '0xc9ea90692757831d98ac629f2a0140e02b80a7da', unit: UNIT },
  },
  hyperliquid: {
    usdt: '0xB8CE59FC3717ada4C02eaDF9682A9e934F625ebb',
    yzUSD: { address: '0xF72CE39998D2075f6661CF4214CfFE3cf38Da72f', unit: UNIT },
    syzUSD: { address: '0x34C07f50c4f55B322E85DEeb265d278E6af112E4', unit: UNIT },
    yzPP: { address: '0x8CBafE7847606FF9aC5eb5e8dd54E5459E8dcC51', unit: UNIT },
  },
  sei: {
    // Sei settles yzPP redemptions into USDC, not USDT.
    usdc: '0xe15fC38F6D8c56aF07bbCBe3BAf5708A2Bf42392',
    yzUSD: { address: '0x9dcB0D17eDDE04D27F387c89fECb78654C373858', unit: UNIT },
    syzUSD: { address: '0xB98b14d316d13f012d52f30A3d46641092AC6944', unit: UNIT },
    yzPP: { address: '0x5a4958AE05640b6483d44B45d36E5eBF7Cd20fe4', unit: UNIT },
  },
};

// Token metadata for pool generation
const TOKEN_META = {
  syzUSD: {
    symbol: 'syzUSD',
    url: 'https://app.yuzu.money/alpha/yzusd-syzusd',
    getUnderlyingTokens: (chain) => [yuzuConfig[chain].yzUSD.address],
  },
  yzPP: {
    symbol: 'yzPP',
    url: 'https://app.yuzu.money/alpha/yzpp',
    // Settlement token: USDT on most chains, USDC on Sei.
    getUnderlyingTokens: (chain) => [
      yuzuConfig[chain].usdt ?? yuzuConfig[chain].usdc,
    ],
  },
  yzPrime: {
    symbol: 'yzPrime',
    url: 'https://app.yuzu.money/rwa/yzprime',
    getUnderlyingTokens: () => [yuzuConfig.monad.usdc],
  },
  yzCash: {
    symbol: 'yzCash',
    url: 'https://app.yuzu.money/marketplace/cash',
    getUnderlyingTokens: () => [yuzuConfig.ethereum.usdc],
  },
};

const getUsdPrice = async (chain, token) => {
  const priceKey = `${chain}:${token.address}`;
  const data = await utils.getPriceApiData(`/prices/current/${priceKey}`);
  const price = data.coins[priceKey]?.price;
  if (price === undefined) {
    throw new Error(`Price not found for ${priceKey}`);
  }

  return price;
};

const getTotalSupply = async (chain, token) => {
  const { output } = await sdk.api.abi.call({
    target: token.address,
    abi: 'erc20:totalSupply',
    chain,
  });
  return output / token.unit;
};

const getRedemptionPrice = async (
  chain,
  blockNumber,
  token,
  underlyingAssetUnit,
) => {
  const { output } = await sdk.api.abi.call({
    target: token.address,
    abi: 'function previewRedeem(uint256 shares) external view returns (uint256)',
    params: [BigInt(token.unit)],
    chain,
    block: blockNumber,
  });
  return output / underlyingAssetUnit;
};

/**
 * Calculate TVL for a token across all chains.
 * Plasma is the home chain — its totalSupply already counts shares bridged out
 * via OFT, so we subtract every other chain's supply to avoid double-counting.
 */
const calculateTvlByToken = async (tokenKey) => {
  const supplies = await Promise.all(
    CHAINS.map((chain) => getTotalSupply(chain, yuzuConfig[chain][tokenKey])),
  );

  // Price always fetched from Plasma (home chain). Fall back to 0 if DefiLlama
  // has no quote so a missing price yields tvlUsd: 0 (filtered downstream)
  // instead of rejecting and taking down every pool.
  const tokenPrice = await getUsdPrice(
    'plasma',
    yuzuConfig.plasma[tokenKey],
  ).catch(() => 0);

  const tvlByChain = {};
  let bridgedSum = 0;
  CHAINS.forEach((chain, i) => {
    if (chain === 'plasma') return;
    tvlByChain[chain] = supplies[i] * tokenPrice;
    bridgedSum += supplies[i];
  });

  const plasmaIdx = CHAINS.indexOf('plasma');
  const effectivePlasmaSupply = Math.max(0, supplies[plasmaIdx] - bridgedSum);
  tvlByChain.plasma = effectivePlasmaSupply * tokenPrice;

  return tvlByChain;
};

/**
 * Returns { apy, currentPrice } — currentPrice is the redemption price used
 * as pricePerShare (drops on loss events, e.g. yzPP).
 */
const calculateApy = async (chain, token, underlyingAssetUnit) => {
  const currentBlock = await sdk.api.util.getLatestBlock(chain);
  const startTimestamp =
    currentBlock.timestamp - APY_REFERENCE_PERIOD_IN_DAYS * DAY_IN_SECONDS;
  const [startBlock] = await utils.getBlocksByTime([startTimestamp], chain);

  const [startPrice, currentPrice] = await Promise.all([
    // Vaults younger than the reference period revert when queried at a
    // pre-deployment block; fall back to NaN so APY degrades to 0 instead
    // of rejecting and taking down every pool.
    getRedemptionPrice(chain, startBlock, token, underlyingAssetUnit).catch(
      () => NaN,
    ),
    getRedemptionPrice(chain, currentBlock.block, token, underlyingAssetUnit),
  ]);

  if (
    !Number.isFinite(startPrice) ||
    !Number.isFinite(currentPrice) ||
    startPrice <= 0
  ) {
    return { apy: 0, currentPrice: Number.isFinite(currentPrice) ? currentPrice : null };
  }

  const appreciationRatio = currentPrice / startPrice;
  const apy =
    (Math.pow(appreciationRatio, YEAR_IN_DAYS / APY_REFERENCE_PERIOD_IN_DAYS) -
      1) *
    100;
  return { apy, currentPrice };
};

/**
 * Fetch pools for a given token type across all chains
 */
const fetchPoolsForToken = async (tokenKey, unit) => {
  const meta = TOKEN_META[tokenKey];

  const [tvlUsd, apyResult] = await Promise.all([
    calculateTvlByToken(tokenKey),
    calculateApy('plasma', yuzuConfig.plasma[tokenKey], unit),
  ]);

  return CHAINS.map((chain) => ({
    pool: `${yuzuConfig[chain][tokenKey].address}-${chain}`.toLowerCase(),
    chain: utils.formatChain(chain),
    project: 'yuzu-money',
    symbol: meta.symbol,
    tvlUsd: tvlUsd[chain],
    apyBase: apyResult.apy,
    ...(apyResult.currentPrice > 0 && { pricePerShare: apyResult.currentPrice }),
    underlyingTokens: meta.getUnderlyingTokens(chain),
    url: meta.url,
  }));
};

/**
 * Fetch a single-chain ERC4626-style vault that redeems directly into USDC
 * (yzPrime on Monad, yzCash on Ethereum).
 * TVL = totalSupply × pricePerShare(USDC) × USDC price.
 */
const fetchSingleChainUsdcVaultPool = async (chain, tokenKey) => {
  const meta = TOKEN_META[tokenKey];
  const token = yuzuConfig[chain][tokenKey];

  const [totalSupply, apyResult, usdcPrice] = await Promise.all([
    getTotalSupply(chain, token),
    calculateApy(chain, token, USDC_UNIT),
    // USDC is a stablecoin; fall back to $1 if the price lookup fails so a
    // missing quote doesn't reject apy() and take down every pool.
    getUsdPrice(chain, { address: yuzuConfig[chain].usdc }).catch(() => 1),
  ]);

  const navInUsdc = apyResult.currentPrice ?? 0;
  const tvlUsd = totalSupply * navInUsdc * usdcPrice;

  return {
    pool: `${token.address}-${chain}`.toLowerCase(),
    chain: utils.formatChain(chain),
    project: 'yuzu-money',
    symbol: meta.symbol,
    tvlUsd,
    apyBase: apyResult.apy,
    ...(apyResult.currentPrice > 0 && { pricePerShare: apyResult.currentPrice }),
    underlyingTokens: meta.getUnderlyingTokens(),
    url: meta.url,
  };
};

const apy = async () => {
  const [syzUSDPools, yzPPPools, yzPrimePool, yzCashPool] = await Promise.all([
    fetchPoolsForToken('syzUSD', UNIT),
    fetchPoolsForToken('yzPP', USDT_UNIT),
    fetchSingleChainUsdcVaultPool('monad', 'yzPrime'),
    fetchSingleChainUsdcVaultPool('ethereum', 'yzCash'),
  ]);

  return [...syzUSDPools, ...yzPPPools, yzPrimePool, yzCashPool];
};

module.exports = {
  protocolId: '6997',
  apy,
};
