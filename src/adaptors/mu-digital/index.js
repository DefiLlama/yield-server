/*
  Yield assets:
  - loAZND (ERC4626 vault): 
    tvlUsd = totalAssets * price(asset) / 10^assetDecimals;
    apyBase = (convertToAssets(1 share)_today / convertToAssets(1 share)_yesterday) ^ 365 - 1.
  - muBOND (rebase/index token; PriceUpdated is per-share/index/NAV): 
    tvlUsd = totalSupply * price / 10^decimals;
    apyBase = (price_now / price_prev) ^ (52 / gapWeeks) - 1. (Default: gapWeeks = 1, price updates once a week).
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
    url: 'https://mudigital.net/',
  },
};

const AZND_ADDRESS = '0x4917a5ec9fcb5e10f47cbb197abe6ab63be81fe8';

const VAULT_ABI = {
  asset: 'function asset() view returns (address)',
};

const PRICE_FEED_ABI = {
  getPrice: 'function getPrice(address token) view returns (uint256,uint8)',
};

const CONVERT_TO_ASSETS_ABI =
  'function convertToAssets(uint256 shares) external view returns (uint256)';

const MU_BOND_APY_MIN_WEEKS = 1;
const MU_BOND_APY_MAX_WEEKS = 12;
const MU_BOND_APY_PERIODS_PER_YEAR = 52;
const VAULT_APY_PERIODS_PER_YEAR = 365;
const SECONDS_PER_WEEK = 7 * 24 * 60 * 60;
const DAY_IN_SECONDS = 24 * 60 * 60;
const MS_PER_SECOND = 1000;
const toUnit = (decimals) => `1${'0'.repeat(decimals)}`;
const pow10 = (decimals) => new BigNumber(10).pow(decimals);

const annualizeRatio = (ratio, periodsPerYear) => {
  const apyBN = ratio.pow(periodsPerYear).minus(1).times(100);
  return apyBN.isFinite() ? apyBN.toNumber() : 0;
};

const annualizeRatioByWeeks = (ratio, gapWeeks) => {
  const periods = MU_BOND_APY_PERIODS_PER_YEAR / gapWeeks;
  if (Number.isInteger(periods)) {
    return annualizeRatio(ratio, periods);
  }
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
  const priceFromFeed = await getPriceFromFeed(priceFeed, asset, chain);
  if (priceFromFeed) return priceFromFeed;
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

const getMuBondPool = async (chain, muBond, priceFeed, url) => {
  try {
    const [totalSupplyRes, decimalsRes, symbolRes, price] =
      await Promise.all([
        getErc20TotalSupply(muBond, chain),
        getErc20Decimals(muBond, chain),
        getErc20Symbol(muBond, chain),
        getPriceWithFallback(priceFeed, muBond, chain),
      ]);

    const tokenDecimals = Number(decimalsRes);
    const tvlUsd = calcTvlUsd(totalSupplyRes, tokenDecimals, price);

    let apyBase = 0;
    const latest = await sdk.api.util.getLatestBlock(chain);
    const { priceRaw: priceNowRaw } = await getPriceRawAtBlock(
      priceFeed,
      muBond,
      chain,
      latest.block
    );
    const priceNow = new BigNumber(priceNowRaw.toString());
    if (!priceNow.isZero()) {
      for (
        let gapWeeks = MU_BOND_APY_MIN_WEEKS;
        gapWeeks <= MU_BOND_APY_MAX_WEEKS;
        gapWeeks += 1
      ) {
        const lookbackSeconds = gapWeeks * SECONDS_PER_WEEK;
        const targetTimestamp = latest.timestamp - lookbackSeconds;
        if (targetTimestamp <= 0) break;

        const prevBlock = await sdk.api.util.lookupBlock(targetTimestamp, {
          chain,
        });
        const { priceRaw: pricePrevRaw } = await getPriceRawAtBlock(
          priceFeed,
          muBond,
          chain,
          prevBlock.block
        );
        const pricePrev = new BigNumber(pricePrevRaw.toString());
        if (pricePrev.isZero()) continue;
        if (pricePrev.eq(priceNow)) continue;

        const ratio = priceNow.div(pricePrev);
        apyBase = annualizeRatioByWeeks(ratio, gapWeeks);
        break;
      }
    }

    return {
      pool: `${muBond}-${chain}`.toLowerCase(),
      chain: formatChain(chain),
      project: 'mu-digital',
      symbol: formatSymbol(symbolRes),
      tvlUsd,
      apyBase,
      url,
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
    };
  }
};

const getERC4626InfoSafe = async (vault, chain, timestamp, assetUnit) => {
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
    if (priceNowBN.isZero() || priceYesterdayBN.isZero()) {
      return { tvl: tvl.output, apyBase: 0 };
    }
    const ratio = priceNowBN.div(priceYesterdayBN);
    const apy = annualizeRatio(ratio, VAULT_APY_PERIODS_PER_YEAR);
    return { tvl: tvl.output, apyBase: apy };
  } catch (error) {
    return null;
  }
};

const getVaultData = async (chain, vault, priceFeed, timestamp, url) => {
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
      (await getERC4626InfoSafe(vault, chain, timestamp, assetUnit)) ||
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
      underlyingTokens: [AZND_ADDRESS],
      poolMeta: 'loAZND Vault',
      url,
    };
  }
};

const apy = async (timestamp) => {
  const poolPromises = Object.entries(CONFIG).flatMap(([chain, cfg]) => {
    const pools = cfg.vaults.map((vault) =>
      getVaultData(chain, vault, cfg.priceFeed, timestamp, cfg.url)
    );
    if (cfg.muBond) {
      pools.push(getMuBondPool(chain, cfg.muBond, cfg.priceFeed, cfg.url));
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
