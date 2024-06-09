const { ethers } = require('ethers');
const sdk = require('@defillama/sdk');
const abi = require('./abi');
const BigNumber = require('bignumber.js'); // support decimal points
const superagent = require('superagent');

const AMBER = '0xdb369eEB33fcfDCd1557E354dDeE7d6cF3146A11';
const EMERALD = '0x4c406C068106375724275Cbff028770C544a1333';
const OPAL = '0x096697720056886b905D0DEB0f06AfFB8e4665E5';

const LUSD = '0x5f98805A4E8be255a32880FDeC7F6728C6568bA0';
const USDC = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';
const WETH = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2';
const LQTY = '0x6DEA81C8171D0bA574754EF6F8b412F2Ed88c54D';
const WSTETH = '0x7f39C581F595B53c5cb19bD0b3f8dA6c935E2Ca0';

const QUARTZ = '0xbA8A621b4a54e61C442F5Ec623687e2a942225ef';

const STABILITY_POOL = '0x66017D22b0f8556afDd19FC67041899Eb65a21bb';
const PRICE_CONVERTER = '0xD76B0Ff4A487CaFE4E19ed15B73f12f6A92095Ca';

const chain = 'ethereum';

const DECIMALS = new BigNumber((1e18).toString());
const USDC_DECIMALS = new BigNumber(1e6).toString();

const COINS = [LUSD, USDC, WETH, LQTY];

const vaultMeta = {
  // it has to be string literal keys
  '0xdb369eEB33fcfDCd1557E354dDeE7d6cF3146A11': {
    asset: LUSD,
    symbol: 'LUSD',
    name: 'Amber',
  },
  '0x096697720056886b905D0DEB0f06AfFB8e4665E5': {
    asset: USDC,
    symbol: 'USDC',
    name: 'Opal',
  },
  '0x4c406C068106375724275Cbff028770C544a1333': {
    asset: WETH,
    symbol: 'WETH',
    name: 'Emerald',
  },
};

const apy = async () => {
  const prices = await getPrices(COINS);

  return await Promise.all(
    [AMBER, OPAL, EMERALD].map((vault) => calcErc4626PoolApy(vault, prices))
  );
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
    `https://coins.llama.fi/block/ethereum/${timestamp}`
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
    project: 'sandclock',
    symbol: vaultMeta[vault].symbol,
    tvlUsd,
    underlyingTokens: [vaultMeta[vault].asset],
    rewardTokens: [QUARTZ],
    apyBase,
    apyBase7d,
    apyReward: 15, // QUARTZ will be airdropped to depositors of Amber, Opal and Emerald vaults
    poolMeta: vaultMeta[vault].name,
    url: 'https://app.sandclock.org/',
  };
}

async function calcTvl(vault, prices) {
  const asset = vaultMeta[vault].asset;
  const price = prices[asset.toLowerCase()];
  const assets = await totalAssets(vault);
  const decimals = asset == USDC ? USDC_DECIMALS : DECIMALS;
  let tvlUsd = assets.multipliedBy(price).div(decimals);
  if (vault === AMBER) {
    const lqtyPrice = prices[LQTY.toLowerCase()];
    const lqtyUsd = await calcLqtyUsd(lqtyPrice);
    tvlUsd = tvlUsd.plus(lqtyUsd);
  }
  return tvlUsd.toNumber();
}

async function calcLqtyUsd(price, block = 'latest') {
  const lqtyBalance = new BigNumber(await balanceOf(LQTY, AMBER, block));
  const lqtyGain = await callAbi(STABILITY_POOL, abi.lqtyGain, AMBER, block);
  return lqtyBalance.plus(lqtyGain).multipliedBy(price).div(DECIMALS);
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
  let assets = await totalAssets(vault, block);
  if (vault === AMBER) {
    const asset = vaultMeta[vault].asset;
    const lusdPrice = prices[asset.toLowerCase()];
    const lqtyPrice = prices[LQTY.toLowerCase()];
    const lqtyAsset = await calcLqtyAsset(lqtyPrice, lusdPrice, block);
    assets = assets.plus(lqtyAsset);
  }
  return assets;
}

const totalAssets = async (vault, block = 'latest') => {
  if (vault == EMERALD) {
    // convert ethers.BigNumber to BigNumber to support decimal points
    return new BigNumber((await totalEmeraldAssets(block)).toString());
  } else if (vault == OPAL) {
    // convert ethers.BigNumber to BigNumber to support decimal points
    return new BigNumber((await totalOpalAssets(block)).toString());
  }
  return new BigNumber(await callAbi(vault, abi.totalAssets, null, block));
};

const totalEmeraldAssets = async (block = 'latest') => {
  const wstEth = await totalCollateral(EMERALD, block);
  const stEthCollateral = await callAbi(WSTETH, abi.getStETH, wstEth, block);
  const wethDebt = await totalDebt(EMERALD, block);
  const float = ethers.BigNumber.from(await balanceOf(WETH, EMERALD, block));
  return float.add(stEthCollateral).sub(wethDebt);
};

const totalOpalAssets = async (block = 'latest') => {
  const collateral = ethers.BigNumber.from(await totalCollateral(OPAL, block));
  const usdcBalance = await callAbi(OPAL, abi.usdcBalance, null, block);
  const wethDebt = await totalDebt(OPAL, block);
  const sharesInvested = await balanceOf(EMERALD, OPAL, block);
  const emeraldAssets = await totalEmeraldAssets(block);
  const emeraldShares = await totalSupply(EMERALD, block);
  const wethInvested = emeraldAssets.mul(sharesInvested).div(emeraldShares);
  let total = collateral.add(usdcBalance);

  if (wethInvested.gt(wethDebt)) {
    const wethProfit = wethInvested.sub(wethDebt);
    const usdcProfit = ethers.BigNumber.from(
      await ethToUsdc(wethProfit, block)
    );
    const slippage = await callAbi(OPAL, abi.slippage, null, block);
    const profit = usdcProfit.mul(slippage).div((1e18).toString());
    total = total.add(profit);
  } else if (wethInvested.lt(wethDebt)) {
    const wethLoss = ethers.BigNumber.from(wethDebt).sub(wethInvested);
    const usdcLoss = await ethToUsdc(wethLoss, block);
    total = total.sub(usdcLoss);
  }

  return total;
};

const ethToUsdc = async (wethValue, block = 'latest') => {
  return await callAbi(
    PRICE_CONVERTER,
    abi.ethToUsdc,
    wethValue.toString(),
    block
  );
};

async function calcLqtyAsset(lqtyPrice, lusdPrice, block = 'latest') {
  const lqtyBalance = new BigNumber(await balanceOf(LQTY, AMBER, block));
  const lqtyGain = await callAbi(STABILITY_POOL, abi.lqtyGain, AMBER, block);
  return lqtyBalance.plus(lqtyGain).multipliedBy(lqtyPrice).div(lusdPrice);
}

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

const totalCollateral = async (vault, block = 'latest') => {
  return await callAbi(vault, abi.totalCollateral, null, block);
};

const totalDebt = async (vault, block = 'latest') => {
  return await callAbi(vault, abi.totalDebt, null, block);
};

const balanceOf = async (token, address, block = 'latest') => {
  return await callAbi(token, abi.balanceOf, address, block);
};

const totalSupply = async (token, block = 'latest') => {
  return await callAbi(token, abi.totalSupply, null, block);
};

async function getShares(vault, block = 'latest') {
  return new BigNumber(await totalSupply(vault, block));
}

async function getSharePrice(assets, shares) {
  return shares.isZero() ? new BigNumber(0) : assets.div(shares);
}

async function callAbi(target, abi, params, block = 'latest') {
  return (await sdk.api.abi.call({ target, abi, params, block, chain })).output;
}

module.exports = {
  timetravel: true,
  apy,
  url: 'https://sandclock.org',
};
