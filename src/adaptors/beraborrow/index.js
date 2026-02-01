const { ethers } = require('ethers');
const sdk = require('@defillama/sdk');
const abi = require('./abi');
const BigNumber = require('bignumber.js');
const superagent = require('superagent');

const BB_SNECT = '0x1d22592F66Fc92e0a64eE9300eAeca548cd466c5';
const NECT = '0x1ce0a25d13ce4d52071ae7e02cf1f6606f4c79d3';

const chain = 'berachain';

const DECIMALS = new BigNumber((1e18).toString());

const COINS = [BB_SNECT, NECT];

const vaultMeta = {
  [BB_SNECT]: {
    asset: NECT,
    symbol: 'BB.sNECT',
    name: 'BB.sNECT Vault',
  },
};

const apy = async () => {
  const prices = await getPrices(COINS);
  const strategyApys = await Promise.all(
    [BB_SNECT].map((vault) => calcErc4626PoolApy(vault, prices))
  );
  return strategyApys;
};

async function getPrices(addresses) {
  const coins = getCoinsURI(addresses);
  const url = `https://coins.llama.fi/prices/current/${coins}`;
  return await fetchPrices(url);
}

async function getPricesDaysBefore(addresses, days) {
  const coins = getCoinsURI(addresses);
  const timestamp = getTimestampDaysBefore(days);
  const url = `https://coins.llama.fi/prices/historical/${timestamp}/${coins}`;
  return await fetchPrices(url);
}

async function fetchPrices(url) {
  const prices = (await superagent.get(url)).body.coins;
  const pricesByAddresses = Object.entries(prices).reduce(
    (acc, [address, price]) => ({
      ...acc,
      [address.split(':')[1].toLowerCase()]: price.price,
    }),
    {}
  );
  return pricesByAddresses;
}

function getCoinsURI(addresses) {
  return `${addresses.map((address) => `${chain}:${address}`)}`;
}

async function getBlockNumberDaysBefore(days) {
  const daysBefore = getTimestampDaysBefore(days);
  return await getBlockNumber(daysBefore);
}

function getTimestampDaysBefore(days) {
  return Math.floor(Date.now() / 1000) - 24 * 60 * 60 * days;
}

async function getBlockNumber(timestamp) {
  const response = await superagent.get(
    `https://coins.llama.fi/block/berachain/${timestamp}`
  );
  return response.body.height;
}

async function calcErc4626PoolApy(vault, prices) {
  const tvlUsd = await calcTvl(vault, prices);

  const sharePriceNow = await calcSharePrice(vault, prices);

  const sharePriceYesterday = await calcSharePrice(vault, prices, 1);
  const apyBase = calcApy(sharePriceNow, sharePriceYesterday, 1);

  const sharePriceWeekBefore = await calcSharePrice(vault, prices, 7);
  const apyBase7d = calcApy(sharePriceNow, sharePriceWeekBefore, 7);

  return {
    pool: `${vault}-${chain}`,
    chain,
    project: 'beraborrow',
    symbol: vaultMeta[vault].symbol,
    tvlUsd,
    underlyingTokens: [vaultMeta[vault].asset],
    rewardTokens: [],
    apyBase,
    apyBase7d,
    apyReward: 0,
    poolMeta: vaultMeta[vault].name,
    url: 'https://app.beraborrow.com/vault',
  };
}

async function calcTvl(vault, prices) {
  const asset = vaultMeta[vault].asset;
  const price = prices[asset.toLowerCase()];
  const assets = await totalAssets(vault);
  const tvlUsd = assets.multipliedBy(price).div(DECIMALS);
  return tvlUsd.toNumber();
}

async function calcSharePrice(vault, prices, days = 0) {
  let assetPrices = prices;
  let block = 'latest';
  if (days > 0) {
    assetPrices = await getPricesDaysBefore(COINS, days);
    block = await getBlockNumberDaysBefore(days);
  }
  const assets = await calcAssets(vault, assetPrices, block);
  const shares = await getShares(vault, block);
  const sharePrice = getSharePrice(assets, shares);
  return sharePrice;
}

async function calcAssets(vault, prices, block = 'latest') {
  const assets = await totalAssets(vault, block);
  return assets;
}

const totalAssets = async (vault, block = 'latest') => {
  return new BigNumber(await callAbi(vault, abi.totalAssets, null, block));
};

function calcApy(sharePriceNow, sharePriceBefore, daysBetween) {
  return sharePriceBefore.isZero()
    ? 0
    : sharePriceNow
        .minus(sharePriceBefore)
        .multipliedBy(36500)
        .div(daysBetween)
        .div(sharePriceBefore)
        .toNumber();
}

async function getShares(vault, block = 'latest') {
  return new BigNumber(await totalSupply(vault, block));
}

async function getSharePrice(assets, shares) {
  return shares.isZero() ? new BigNumber(0) : assets.div(shares);
}

async function callAbi(target, abi, params, block = 'latest') {
  return (await sdk.api.abi.call({ target, abi, params, block, chain })).output;
}

const totalSupply = async (token, block = 'latest') => {
  return await callAbi(token, abi.totalSupply, null, block);
};

module.exports = {
  timetravel: true,
  apy,
  url: 'https://beraborrow.com',
};
