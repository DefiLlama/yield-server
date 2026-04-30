/*
  Yield assets:
  - loAZND (ERC4626 vault): 
    tvlUsd = totalAssets * price(asset) / 10^assetDecimals;
    apyBase = (convertToAssets(1 share)_today / convertToAssets(1 share)_yesterday) ^ yearDays - 1.
  - muBOND (rebase/index token; PriceUpdated is per-share/index/NAV): 
    tvlUsd = circulatingSupply * price / 10^decimals;
    on Monad, circulatingSupply = totalSupply(monad) - totalSupply(ethereum);
    on Ethereum, circulatingSupply = totalSupply(ethereum).
    apyBase = (price_now / price_prev) ^ (yearDays / gapDays) - 1,
    
    Where: 
    - price_prev: the price from the previous observed plateau before the current plateau
    - yearDays: 365 or 366 (for leap year) based on calculation timestamp
    - gapDays: the approximate duration in days between the starts of the current and previous plateaus,
      found by daily snapshots first and then refined hourly near the change boundaries.
*/
const path = require('path');
const axios = require('axios');
// Prefer the repo-level SDK since nested node_modules can be out of date.
const sdk = (() => {
  const rootSdkPath = path.resolve(
    __dirname,
    '../../..',
    'node_modules',
    '@defillama',
    'sdk'
  );
  try {
    return require(rootSdkPath);
  } catch (error) {
    return require('@defillama/sdk');
  }
})();
const { default: BigNumber } = require('bignumber.js');
const utils = require('../utils');
const { formatChain, formatSymbol } = utils;

const CONFIG = {
  monad: {
    vaults: ['0x9c82eB49B51F7Dc61e22Ff347931CA32aDc6cd90'],
    muBond: '0x336D414754967C6682B5A665C7DAF6F1409E63e8',
    priceFeed: '0x8B9670C5E4D9F1C14f1F9fe625Dd099924aD4D4f',
    aznd: '0x4917a5ec9fcb5e10f47cbb197abe6ab63be81fe8',
    url: 'https://mudigital.net/',
  },
  ethereum: {
    vaults: ['0xa6142276526724CFaEe9151d280385BdF43e0503'],
    muBond: '0x09AD9c6DcadCc3aB0b3E107E8E7DA69c2eEa8599',
    priceFeed: '0xE200C42374258c4c192f35e4bEB5E489b0cbc0a4',
    aznd: '0x52c66B5E7f8Fde20843De900C5C8B4b0F23708A0',
    url: 'https://mudigital.net/',
  },
};

const VAULT_ABI = {
  asset: 'function asset() view returns (address)',
};

const PRICE_FEED_ABI = {
  getPrice: 'function getPrice(address token) view returns (uint256,uint8)',
};

const CONVERT_TO_ASSETS_ABI =
  'function convertToAssets(uint256 shares) external view returns (uint256)';

const DEFAULT_DAYS_PER_YEAR = 365;
const DAY_IN_SECONDS = 24 * 60 * 60;
const HOUR_IN_SECONDS = 60 * 60;
const MIN_GAP_THRESHOLD_DAYS = 2;
const MS_PER_SECOND = 1000;
const MU_BOND_APY_MAX_LOOKBACK_DAYS = 14;
const toUnit = (decimals) => `1${'0'.repeat(decimals)}`;
const pow10 = (decimals) => new BigNumber(10).pow(decimals);

const isLeapYear = (year) =>
  (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;

const getDaysInYear = (timestamp) => {
  if (!Number.isFinite(timestamp) || timestamp <= 0) return DEFAULT_DAYS_PER_YEAR;
  const year = new Date(timestamp * MS_PER_SECOND).getUTCFullYear();
  return isLeapYear(year) ? 366 : 365;
};

const annualizeRatio = (ratio, periodsPerYear) => {
  const apyBN = ratio.pow(periodsPerYear).minus(1).times(100);
  return apyBN.isFinite() ? apyBN.toNumber() : 0;
};

const annualizeRatioByGapDays = (ratio, gapDays, referenceTimestamp) => {
  if (!Number.isFinite(gapDays) || gapDays <= 0) return 0;
  const periods = getDaysInYear(referenceTimestamp) / gapDays;
  const ratioNum = ratio.toNumber();
  if (!Number.isFinite(ratioNum) || ratioNum <= 0) return 0;
  const apy = (Math.pow(ratioNum, periods) - 1) * 100;
  return Number.isFinite(apy) ? apy : 0;
};

const calcTvlUsd = (amountRaw, decimals, price) => {
  if (!price || price.isZero()) return 0;
  return price
    .times(new BigNumber(amountRaw))
    .div(pow10(decimals))
    .toNumber();
};

const getErc20Value = async (target, abi, chain) => {
  const { output } = await sdk.api.abi.call({
    target,
    abi,
    chain,
  });
  return output;
};

const getErc20Decimals = async (target, chain) =>
  Number(await getErc20Value(target, 'erc20:decimals', chain));

const getErc20Symbol = async (target, chain) =>
  getErc20Value(target, 'erc20:symbol', chain);

const getErc20TotalSupply = async (target, chain) =>
  getErc20Value(target, 'erc20:totalSupply', chain);

const getTokenPrice = async (tokenAddress, chain) => {
  const priceKey = `${chain}:${tokenAddress.toLowerCase()}`;
  const { data } = await axios.get(
    `https://coins.llama.fi/prices/current/${priceKey}`
  );
  return data.coins?.[priceKey]?.price ?? 0;
};

const getPriceFromFeed = async (priceFeed, asset, chain) => {
  const priceRes = await sdk.api.abi.call({
    target: priceFeed,
    abi: PRICE_FEED_ABI.getPrice,
    params: [asset],
    chain,
  });

  const [priceRaw, priceDecimals] = Array.isArray(priceRes.output)
    ? priceRes.output
    : ['0', 0];

  if (!priceRaw || priceRaw === '0') return null;

  return new BigNumber(priceRaw).div(pow10(priceDecimals));
};

const getPriceWithFallback = async (priceFeed, asset, chain) => {
  try {
    const priceFromFeed = await getPriceFromFeed(priceFeed, asset, chain);
    if (priceFromFeed) return priceFromFeed;
  } catch (error) { }
  return new BigNumber(await getTokenPrice(asset, chain));
};

const getPriceRawAtBlock = async (priceFeed, token, chain, block) => {
  const res = await sdk.api.abi.call({
    target: priceFeed,
    abi: PRICE_FEED_ABI.getPrice,
    params: [token],
    chain,
    block,
  });
  const [priceRaw, priceDecimals] = Array.isArray(res.output)
    ? res.output
    : ['0', 0];
  return {
    priceRaw: priceRaw ?? '0',
    priceDecimals: priceDecimals ?? 0,
  };
};

const getPriceRawAtBlockSafe = async (priceFeed, token, chain, block) => {
  try {
    return await getPriceRawAtBlock(priceFeed, token, chain, block);
  } catch (error) {
    return null;
  }
};

const normalizePriceData = ({ priceRaw, priceDecimals }) => {
  const raw = new BigNumber((priceRaw ?? '0').toString());
  if (raw.isZero()) return raw;
  return raw.div(pow10(Number(priceDecimals ?? 0)));
};

const getMuBondPriceSnapshot = async (chain, muBond, priceFeed, timestamp) => {
  if (!Number.isFinite(timestamp) || timestamp <= 0) return null;

  const block = await sdk.api.util.lookupBlock(timestamp, { chain });
  const priceData = await getPriceRawAtBlockSafe(
    priceFeed,
    muBond,
    chain,
    block.block
  );
  if (!priceData) return null;

  const price = normalizePriceData(priceData);
  if (price.isZero()) return null;

  return { price, timestamp };
};

const refinePlateauStartByHour = async (
  chain,
  muBond,
  priceFeed,
  olderSnapshot,
  newerSnapshot
) => {
  if (!olderSnapshot || !newerSnapshot) return null;
  if (olderSnapshot.timestamp >= newerSnapshot.timestamp) return null;

  let earliestNewerTimestamp = newerSnapshot.timestamp;
  const totalHours = Math.ceil(
    (newerSnapshot.timestamp - olderSnapshot.timestamp) / HOUR_IN_SECONDS
  );

  for (let hourOffset = 1; hourOffset <= totalHours; hourOffset++) {
    const timestamp = newerSnapshot.timestamp - hourOffset * HOUR_IN_SECONDS;
    if (timestamp <= olderSnapshot.timestamp) break;

    const snapshot = await getMuBondPriceSnapshot(
      chain,
      muBond,
      priceFeed,
      timestamp
    );

    if (!snapshot) continue;
    if (!snapshot.price.eq(newerSnapshot.price)) return earliestNewerTimestamp;

    earliestNewerTimestamp = timestamp;
  }

  return earliestNewerTimestamp;
};

const getMuBondSupply = async (token, chain) => {
  const totalSupply = new BigNumber(await getErc20TotalSupply(token, chain));
  if (chain !== 'monad') return totalSupply;

  const ethereumSupply = new BigNumber(
    await getErc20TotalSupply(CONFIG.ethereum.muBond, 'ethereum')
  );
  const circulatingSupply = totalSupply.minus(ethereumSupply);
  return circulatingSupply.isNegative() ? new BigNumber(0) : circulatingSupply;
};

const getMuBondApy = async (chain, muBond, priceFeed) => {
  const latest = await sdk.api.util.getLatestBlock(chain);
  const priceNowData = await getPriceRawAtBlockSafe(
    priceFeed,
    muBond,
    chain,
    latest.block
  );
  const priceNow = normalizePriceData(
    priceNowData ?? { priceRaw: '0', priceDecimals: 0 }
  );
  if (priceNow.isZero()) return 0;

  let lastSnapshot = { price: priceNow, timestamp: latest.timestamp };
  let currentPlateauBoundary = null;
  let previousPlateauBoundary = null;

  for (
    let lookbackDays = 1;
    lookbackDays <= MU_BOND_APY_MAX_LOOKBACK_DAYS;
    lookbackDays++
  ) {
    const targetTimestamp = latest.timestamp - lookbackDays * DAY_IN_SECONDS;
    const snapshot = await getMuBondPriceSnapshot(
      chain,
      muBond,
      priceFeed,
      targetTimestamp
    );

    if (!snapshot) continue;

    if (!currentPlateauBoundary) {
      if (snapshot.price.eq(priceNow)) {
        lastSnapshot = snapshot;
        continue;
      }

      currentPlateauBoundary = {
        older: snapshot,
        newer: lastSnapshot,
      };
      lastSnapshot = snapshot;
      continue;
    }

    if (snapshot.price.eq(lastSnapshot.price)) {
      lastSnapshot = snapshot;
      continue;
    }

    previousPlateauBoundary = {
      older: snapshot,
      newer: lastSnapshot,
    };
    break;
  }

  if (!currentPlateauBoundary || !previousPlateauBoundary) return 0;

  const [currentPlateauStart, previousPlateauStart] = await Promise.all([
    refinePlateauStartByHour(
      chain,
      muBond,
      priceFeed,
      currentPlateauBoundary.older,
      currentPlateauBoundary.newer
    ),
    refinePlateauStartByHour(
      chain,
      muBond,
      priceFeed,
      previousPlateauBoundary.older,
      previousPlateauBoundary.newer
    ),
  ]);

  if (!currentPlateauStart || !previousPlateauStart) return 0;

  let gapDays =
    (currentPlateauStart - previousPlateauStart) / DAY_IN_SECONDS;
  if (gapDays <= 0) return 0;
  if (gapDays < MIN_GAP_THRESHOLD_DAYS) {
    gapDays = 1;
  }

  const ratio = priceNow.div(currentPlateauBoundary.older.price);
  return annualizeRatioByGapDays(ratio, gapDays, latest.timestamp);
};

const getMuBondPool = async (
  chain,
  muBond,
  priceFeed,
  url,
  aznd
) => {
  try {
    const [circulatingSupplyRes, decimalsRes, symbolRes, price] =
      await Promise.all([
        getMuBondSupply(muBond, chain),
        getErc20Decimals(muBond, chain),
        getErc20Symbol(muBond, chain),
        getPriceWithFallback(priceFeed, muBond, chain),
      ]);

    const tokenDecimals = Number(decimalsRes);
    const tvlUsd = calcTvlUsd(circulatingSupplyRes.toFixed(0), tokenDecimals, price);

    const apyBase = await getMuBondApy(chain, muBond, priceFeed);

    return {
      pool: `${muBond}-${chain}`.toLowerCase(),
      chain: formatChain(chain),
      project: 'mu-digital',
      symbol: formatSymbol(symbolRes),
      tvlUsd,
      apyBase,
      url,
      underlyingTokens: [aznd],
    };
  } catch (error) {
    console.error(`Error fetching muBOND data for ${muBond}:`, error);
    return {
      pool: `${muBond}-${chain}`.toLowerCase(),
      chain: formatChain(chain),
      project: 'mu-digital',
      symbol: 'muBOND',
      tvlUsd: 0,
      apyBase: 0,
      url,
      underlyingTokens: [aznd],
    };
  }
};

const getERC4626InfoSafe = async (
  vault,
  chain,
  timestamp,
  assetUnit,
  assetDecimals
) => {
  try {
    const latest = await sdk.api.util.getLatestBlock(chain);
    const now = timestamp || Math.floor(Date.now() / MS_PER_SECOND);
    const safeTimestamp = Math.min(latest.timestamp, now);
    const [blockNow, blockYesterday] = await Promise.all([
      sdk.api.util.lookupBlock(safeTimestamp, { chain }),
      sdk.api.util.lookupBlock(safeTimestamp - DAY_IN_SECONDS, { chain }),
    ]);
    const [tvl, priceNow, priceYesterday] = await Promise.all([
      sdk.api.abi.call({
        target: vault,
        block: blockNow.block,
        abi: 'uint:totalAssets',
        chain,
      }),
      sdk.api.abi.call({
        target: vault,
        block: blockNow.block,
        abi: CONVERT_TO_ASSETS_ABI,
        params: [assetUnit],
        chain,
      }),
      sdk.api.abi.call({
        target: vault,
        block: blockYesterday.block,
        abi: CONVERT_TO_ASSETS_ABI,
        params: [assetUnit],
        chain,
      }),
    ]);
    const priceNowBN = new BigNumber(priceNow.output);
    const priceYesterdayBN = new BigNumber(priceYesterday.output);
    // convertToAssets returns asset amounts in native decimals; rescale to
    // 18-dec share units so pricePerShare is comparable across vaults.
    const decimalScale = new BigNumber(10).pow(18 - Number(assetDecimals));
    const pricePerShare = priceNowBN.isZero()
      ? null
      : priceNowBN
          .div(new BigNumber(assetUnit))
          .times(decimalScale)
          .toNumber();
    if (priceNowBN.isZero() || priceYesterdayBN.isZero()) {
      return { tvl: tvl.output, apyBase: 0, pricePerShare };
    }
    const ratio = priceNowBN.div(priceYesterdayBN);
    const apy = annualizeRatio(ratio, getDaysInYear(safeTimestamp));
    return { tvl: tvl.output, apyBase: apy, pricePerShare };
  } catch (error) {
    return null;
  }
};

const getVaultData = async (
  chain,
  vault,
  priceFeed,
  timestamp,
  url,
  fallbackAznd
) => {
  try {
    const [assetRes, shareDecimalsRes, vaultSymbolRes] = await Promise.all([
      sdk.api.abi.call({
        target: vault,
        abi: VAULT_ABI.asset,
        chain,
      }),
      getErc20Decimals(vault, chain),
      getErc20Symbol(vault, chain),
    ]);

    const asset = assetRes.output;
    const shareDecimals = Number(shareDecimalsRes);
    const assetUnit = toUnit(shareDecimals);

    const assetDecimals = await getErc20Decimals(asset, chain);
    const erc4626Info =
      (await getERC4626InfoSafe(vault, chain, timestamp, assetUnit, assetDecimals)) ||
      (await sdk.api.abi
        .call({
          target: vault,
          abi: 'uint:totalAssets',
          chain,
        })
        .then((res) => ({ tvl: res.output, apyBase: 0 })));
    const price = await getPriceWithFallback(priceFeed, asset, chain);
    const tvlUsd = calcTvlUsd(erc4626Info?.tvl ?? 0, assetDecimals, price);

    return {
      pool: `${vault}-${chain}`.toLowerCase(),
      chain: formatChain(chain),
      project: 'mu-digital',
      symbol: formatSymbol(vaultSymbolRes),
      tvlUsd,
      apyBase: erc4626Info?.apyBase ?? 0,
      ...(Number.isFinite(erc4626Info?.pricePerShare) && erc4626Info.pricePerShare > 0 && { pricePerShare: erc4626Info.pricePerShare }),
      underlyingTokens: [asset],
      poolMeta: 'loAZND Vault',
      url,
    };
  } catch (error) {
    console.error(`Error fetching mu-digital vault data for ${vault}:`, error);
    return {
      pool: `${vault}-${chain}`.toLowerCase(),
      chain: formatChain(chain),
      project: 'mu-digital',
      symbol: 'loAZND',
      tvlUsd: 0,
      apyBase: 0,
      underlyingTokens: [fallbackAznd],
      poolMeta: 'loAZND Vault',
      url,
    };
  }
};

const apy = async (timestamp) => {
  const poolPromises = Object.entries(CONFIG).flatMap(([chain, cfg]) => {
    const pools = cfg.vaults.map((vault) =>
      getVaultData(
        chain,
        vault,
        cfg.priceFeed,
        timestamp,
        cfg.url,
        cfg.aznd
      )
    );
    if (cfg.muBond) {
      pools.push(
        getMuBondPool(
          chain,
          cfg.muBond,
          cfg.priceFeed,
          cfg.url,
          cfg.aznd
        )
      );
    }
    return pools;
  });

  const pools = await Promise.all(poolPromises);
  return pools.filter(Boolean);
};

module.exports = {
  timetravel: false,
  apy,
  url: 'https://mudigital.net/',
};
