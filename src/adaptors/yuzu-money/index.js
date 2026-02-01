const sdk = require('@defillama/sdk');
const utils = require('../utils');
const axios = require('axios');

// Constants
const CHAINS = ['plasma', 'ethereum', 'monad'];
const UNIT = 1e18;
const YEAR_IN_DAYS = 365;
const DAY_IN_SECONDS = 24 * 60 * 60;
const APY_REFERENCE_PERIOD_IN_DAYS = 7;

// USDT address on Plasma (underlying asset for yzPP)
const PLASMA_USDT_ADDRESS = '0xB8CE59FC3717ada4C02eaDF9682A9e934F625ebb';
const USDT_UNIT = 1e6;

const yuzuConfig = {
  plasma: {
    yzUSD: {
      address: '0x6695c0f8706c5ace3bdf8995073179cca47926dc',
      unit: UNIT,
    },
    syzUSD: {
      address: '0xc8a8df9b210243c55d31c73090f06787ad0a1bf6',
      unit: UNIT,
    },
    yzPP: {
      address: '0xEbFC8C2Fe73C431Ef2A371AeA9132110aaB50DCa',
      unit: UNIT,
    },
  },
  ethereum: {
    yzUSD: {
      address: '0x387167e5C088468906Bcd67C06746409a8E44abA',
      unit: UNIT,
    },
    syzUSD: {
      address: '0x6DFF69eb720986E98Bb3E8b26cb9E02Ec1a35D12',
      unit: UNIT,
    },
    yzPP: {
      address: '0xB2429bA2cfa6387C9A336Da127d34480C069F851',
      unit: UNIT,
    },
  },
  monad: {
    yzUSD: {
      address: '0x9dcB0D17eDDE04D27F387c89fECb78654C373858',
      unit: UNIT,
    },
    syzUSD: {
      address: '0x484be0540aD49f351eaa04eeB35dF0f937D4E73f',
      unit: UNIT,
    },
    yzPP: {
      address: '0xb37476cB1F6111cC682b107B747b8652f90B0984',
      unit: UNIT,
    },
  },
};

// Token metadata for pool generation
const TOKEN_META = {
  syzUSD: {
    symbol: 'syzUSD',
    url: 'https://app.yuzu.money/yzusd-syzusd',
    getUnderlyingTokens: (chain) => [yuzuConfig['plasma'].yzUSD.address],
  },
  yzPP: {
    symbol: 'yzPP',
    url: 'https://app.yuzu.money/yzpp',
    getUnderlyingTokens: () => [PLASMA_USDT_ADDRESS],
  },
};

const getUsdPrice = async (chain, token) => {
  const priceKey = `${chain}:${token.address}`;
  const { data } = await axios.get(
    `https://coins.llama.fi/prices/current/${priceKey}`,
  );
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
 * Calculate TVL for a token across all chains
 * Plasma supply = total - bridged amounts (monad + ethereum)
 */
const calculateTvlByToken = async (tokenKey) => {
  const [plasmaSupply, monadSupply, ethereumSupply] = await Promise.all([
    getTotalSupply('plasma', yuzuConfig.plasma[tokenKey]),
    getTotalSupply('monad', yuzuConfig.monad[tokenKey]),
    getTotalSupply('ethereum', yuzuConfig.ethereum[tokenKey]),
  ]);

  // Price always fetched from Plasma
  const tokenPrice = await getUsdPrice('plasma', yuzuConfig.plasma[tokenKey]);
  const effectivePlasmaSupply = Math.max(
    0,
    plasmaSupply - monadSupply - ethereumSupply,
  );

  return {
    plasma: effectivePlasmaSupply * tokenPrice,
    ethereum: ethereumSupply * tokenPrice,
    monad: monadSupply * tokenPrice,
  };
};

/**
 * Calculate APY based on redemption price appreciation over reference period
 */
const calculateApy = async (chain, token, underlyingAssetUnit) => {
  const currentBlock = await sdk.api.util.getLatestBlock(chain);
  const startTimestamp =
    currentBlock.timestamp - APY_REFERENCE_PERIOD_IN_DAYS * DAY_IN_SECONDS;
  const [startBlock] = await utils.getBlocksByTime([startTimestamp], chain);

  const [startPrice, currentPrice] = await Promise.all([
    getRedemptionPrice(chain, startBlock, token, underlyingAssetUnit),
    getRedemptionPrice(chain, currentBlock.block, token, underlyingAssetUnit),
  ]);

  if (
    !Number.isFinite(startPrice) ||
    !Number.isFinite(currentPrice) ||
    startPrice <= 0
  ) {
    return 0;
  }

  const appreciationRatio = currentPrice / startPrice;
  return (
    (Math.pow(appreciationRatio, YEAR_IN_DAYS / APY_REFERENCE_PERIOD_IN_DAYS) -
      1) *
    100
  );
};

/**
 * Fetch pools for a given token type across all chains
 */
const fetchPoolsForToken = async (tokenKey, unit) => {
  const meta = TOKEN_META[tokenKey];

  const [tvlUsd, apyBase] = await Promise.all([
    calculateTvlByToken(tokenKey),
    calculateApy('plasma', yuzuConfig.plasma[tokenKey], unit),
  ]);

  return CHAINS.map((chain) => ({
    pool: `${yuzuConfig[chain][tokenKey].address}-${chain}`.toLowerCase(),
    chain: utils.formatChain(chain),
    project: 'yuzu-money',
    symbol: meta.symbol,
    tvlUsd: tvlUsd[chain],
    apyBase,
    underlyingTokens: meta.getUnderlyingTokens(chain),
    url: meta.url,
  }));
};

const apy = async () => {
  const [syzUSDPools, yzPPPools] = await Promise.all([
    fetchPoolsForToken('syzUSD', UNIT),
    fetchPoolsForToken('yzPP', USDT_UNIT),
  ]);

  return [...syzUSDPools, ...yzPPPools];
};

module.exports = {
  apy,
};
