const utils = require('../utils');

const networks = {
  1: 'ethereum',
  10: 'optimism',
  56: 'bsc',
  100: 'xdai',
  137: 'polygon',
  250: 'fantom',
  8453: 'base',
  42161: 'arbitrum',
  42220: 'celo',
};

// Token addresses per chain for underlying token resolution
const TOKEN_ADDRESSES = {
  ethereum: {
    EURA: '0x1a7e4e63778B4f12a199C062f3eFdD288afCBce8',
    USDA: '0x0000206329b97DB379d5E1Bf586BbDB969C63274',
    EUROC: '0x1aBaEA1f7C830bD89Acc67eC4af516284b1bC33c',
    ANGLE: '0x31429d1856aD1377A8A0079410B297e1a9e214c2',
    USDT: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
    USDC: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
  },
  bsc: {
    EURA: '0x12f31b73d812c6bb0d735a218c086d44d5fe5f89',
    USDT: '0x55d398326f99059fF775485246999027B3197955',
  },
  optimism: {
    EURA: '0x9485aca5bbBE1667AD97c7fE7C4531a624C8b1ED',
    USDA: '0x0000206329b97DB379d5E1Bf586BbDB969C63274',
    USDC: '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85',
  },
  base: {
    EURA: '0xA61BeB4A3d02dEcb01039e378237032B351125B4',
    USDA: '0x0000206329b97DB379d5E1Bf586BbDB969C63274',
    USDC: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
  },
  arbitrum: {
    EURA: '0xFA5Ed56A203466CbBC2430a43c66b9D8723528E7',
    USDA: '0x0000206329b97DB379d5E1Bf586BbDB969C63274',
    USDC: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
  },
  xdai: {
    EURA: '0x4b1E2c2762667331Bc91648052F646d1b0d35984',
  },
  celo: {
    EURA: '0xC16B81Af351BA9e64C1a069E3Ab18c244A1E3049',
  },
};

// Map staking wrapper symbols to their underlying token
const STAKING_SYMBOL_MAP = { stEUR: 'EURA', stUSD: 'USDA' };

// Resolve underlying tokens from symbol + chain
const resolveUnderlying = (symbol, chain) => {
  const tokens = TOKEN_ADDRESSES[chain] || {};

  // Staking wrapper (stEUR → EURA, stUSD → USDA)
  const underlying = STAKING_SYMBOL_MAP[symbol];
  if (underlying && tokens[underlying]) return [tokens[underlying]];

  // LP pair (EURA-EUROC → [EURA addr, EUROC addr])
  const parts = symbol.split('-').map((s) => s.trim()).filter(Boolean);
  if (parts.length >= 2) {
    const addrs = parts.map((p) => tokens[p]).filter(Boolean);
    if (addrs.length === parts.length) return addrs;
  }

  // Single asset (USDA → [USDA addr])
  if (tokens[symbol]) return [tokens[symbol]];

  return undefined;
};

const CDP_URL = 'https://api.angle.money/v1/vaultManagers';
const cdpNetworksSupport = {
  1: 'ethereum',
  137: 'polygon',
  42161: 'arbitrum',
  10: 'optimism',
};

const getPoolsData = async () => {
  const apyData = await utils.getData('https://api.angle.money//v1/incentives');

  const result = [];
  for (const staking of Object.keys(apyData)) {
    const entry = apyData[staking];
    if (entry.deprecated) continue;

    const chain = networks[entry?.network];
    if (!chain) continue;

    // Parse symbol from name by stripping chain suffixes, protocol prefixes, and descriptors
    let symbol = entry?.name.replace('/', '-');
    const chainSuffixes = ['gnosis chain', 'ethereum', 'arbitrum', 'optimism', 'base', 'polygon', 'celo', 'bsc'];
    const protocolPrefixes = ['curve', 'sushi', 'velodrome', 'aerodrome', 'pancakeswapv3', 'pancakeswap', 'silo', 'spectra', 'd8x', 'gauntlet', 're7'];
    const descriptorSuffixes = ['lp', 'lending', 'collateral', 'core'];
    for (const s of chainSuffixes) {
      if (symbol.toLowerCase().endsWith(s)) { symbol = symbol.slice(0, -s.length).trim(); break; }
    }
    for (const p of protocolPrefixes) {
      if (symbol.toLowerCase().startsWith(p)) { symbol = symbol.slice(p.length).trim(); break; }
    }
    for (const s of descriptorSuffixes) {
      if (symbol.toLowerCase().endsWith(s)) { symbol = symbol.slice(0, -s.length).trim(); break; }
    }
    // Clean up: strip leading/trailing dashes, collapse whitespace
    symbol = symbol.replace(/^[\s-]+|[\s-]+$/g, '').replace(/\s+/g, ' ');

    const stakingAddress = entry?.address;
    const underlyingTokens = resolveUnderlying(symbol, chain);

    // Extract reward tokens from API
    const rewardTokens = entry?.rewardTokens
      ?.map((r) => r.address)
      .filter(Boolean);

    // Preserve original pool ID format for Ethereum; add chain for multi-chain pools
    const poolId = entry.network === 1
      ? `${stakingAddress}-angle`
      : `${stakingAddress}-${chain}-angle`;

    const pool = {
      pool: poolId,
      chain: utils.formatChain(chain),
      project: 'angle',
      symbol: symbol,
      tvlUsd: entry?.tvl || 0,
      apyBase: entry?.apr?.value || 0,
      ...(underlyingTokens && { underlyingTokens }),
      ...(rewardTokens?.length > 0 && { rewardTokens }),
    };
    result.push(pool);
  }

  return result;
};

const AGEUR = 'ageur';

const cdpData = async () => {
  const queryChainId = (chainId) => `?chainId=${chainId}`;

  const vaultCall = (
    await Promise.all(
      Object.keys(cdpNetworksSupport).map((id) =>
        utils.getData(`${CDP_URL}${queryChainId(id)}`)
      )
    )
  ).map((pool) => Object.keys(pool).map((key) => pool[key]));
  const result = [];
  const mintedCoinPrice = (await utils.getPrices([`coingecko:${AGEUR}`]))
    .pricesBySymbol[AGEUR.toLowerCase()];

  for (const [index, vault] of vaultCall.entries()) {
    const stableAdress = vault.map((e) => e.stablecoin);
    const collateralAdrees = vault.map((e) => e.collateral);
    const chain = Object.values(cdpNetworksSupport)[index];
    const coins = collateralAdrees.map((address) => `${chain}:${address}`);
    const prices = (
      await utils.getPrices([...coins, `${chain}:${stableAdress[0]}`])
    ).pricesByAddress;

    const _result = vault.map((_vault) => {
      const totalSupplyUsd =
        Number(_vault.totalCollateral) *
        prices[_vault.collateral.toLowerCase()];
      const totalBorrowUsd = Number(_vault.totalDebt) * mintedCoinPrice;

      return {
        pool: `${_vault.address}-${chain}`,
        project: 'angle',
        chain: utils.formatChain(chain),
        symbol: _vault.symbol.split('-')[0],
        apy: 0,
        tvlUsd: totalSupplyUsd,
        apyBaseBorrow: ((_vault.stabilityFee - 1) / 1) * 100,
        totalSupplyUsd: totalSupplyUsd,
        totalBorrowUsd: totalBorrowUsd,
        ltv: Number(_vault.maxLTV),
        mintedCoin: 'agEUR',
        debtCeilingUsd:
          (Number(_vault.debtCeiling) / 10 ** 18) * mintedCoinPrice,
        underlyingTokens: [_vault.collateral],
      };
    });

    result.push(_result);
  }
  return result.flat();
};

const main = async () => {
  const apy = await getPoolsData();
  const cdp = await cdpData();
  return [...apy, ...cdp].filter((p) => utils.keepFinite(p));
};

module.exports = {
  timetravel: false,
  apy: main,
  url: 'https://app.angle.money/earn',
};
