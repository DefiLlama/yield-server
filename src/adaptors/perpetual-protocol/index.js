const utils = require('../utils');

const vaultAbi = require('./abi/QuoteVault');
const erc20abi = require('./abi/erc20');
const BN = require('bignumber.js');
const { getBlocksByTime } = require('../utils');
const { Web3 } = require('web3');

const web3 = new Web3(
  new Web3.providers.HttpProvider('https://rpc.ankr.com/optimism')
);

function getErc20Contract(token) {
  return new web3.eth.Contract(erc20abi, token);
}

async function getDecimals(token) {
  const erc20 = getErc20Contract(token);
  const decimals = await erc20.methods.decimals().call();
  return BN(decimals);
}

async function getSymbol(token) {
  const erc20 = getErc20Contract(token);
  return await erc20.methods.symbol().call();
}

async function getTotalAssets(vault, block) {
  const vaultContract = new web3.eth.Contract(vaultAbi, vault);
  const totalAssets = await vaultContract.methods.totalAssets().call({}, block);
  return BN(totalAssets);
}

async function getTotalSupply(token, block) {
  const erc20 = getErc20Contract(token);
  const totalSupply = await erc20.methods.totalSupply().call({}, block);
  return BN(totalSupply);
}

async function getTvlInUsd(vault, vaultAssetToken, block) {
  const totalAssetX10d = await getTotalAssets(vault, block);
  const decimals = await getDecimals(vaultAssetToken);
  const price = (
    await utils.getPrices([vaultAssetToken.toLowerCase()], 'optimism')
  ).pricesByAddress[vaultAssetToken.toLowerCase()];

  const totalAsset = totalAssetX10d.div(BN(10).pow(decimals));

  return totalAsset.times(price).toNumber();
}

async function getApyInNDaysPercentage(
  vault,
  vaultAssetToken,
  vaultToken,
  blockNow,
  blockNDaysAgo,
  nDays
) {
  const assetTokenDecimal = await getDecimals(vaultAssetToken);
  const vaultTokenDecimals = await getDecimals(vaultToken);

  const todayAssetX10d = await getTotalAssets(vault, blockNow);
  const todayAsset = todayAssetX10d.div(BN(10).pow(assetTokenDecimal));
  const todaySupplyX10d = await getTotalSupply(vaultToken, blockNow);

  const todaySupply = todaySupplyX10d.div(BN(10).pow(vaultTokenDecimals));
  const todaySharePrice = todayAsset.div(todaySupply);

  const nDaysAgoAssetX10d = await getTotalAssets(vault, blockNDaysAgo);
  const nDaysAgoAsset = nDaysAgoAssetX10d.div(BN(10).pow(assetTokenDecimal));
  const nDaysAgoSupplyX10d = await getTotalSupply(vaultToken, blockNDaysAgo);
  const nDaysAgoSupply = nDaysAgoSupplyX10d.div(BN(10).pow(vaultTokenDecimals));
  const nDaysAgoSharePrice = nDaysAgoAsset.div(nDaysAgoSupply);

  const apr = todaySharePrice.minus(nDaysAgoSharePrice).div(nDays).times(365);

  const aprInPercentage = apr.times(100);
  return utils.aprToApy(aprInPercentage.toNumber());
}

async function calculatePool(vault, vaultAssetToken, vaultToken) {
  const timestampNow = Math.floor(Date.now() / 1_000);
  const timestamp24hsAgo = timestampNow - 86_400;
  const timestamp7daysAgo = timestampNow - 86_400 * 7;
  const [block7daysAgo, block24hrsAgo, blockNow] = await getBlocksByTime(
    [timestamp7daysAgo, timestamp24hsAgo, timestampNow],
    'optimism'
  );

  const tvlInUsd = await getTvlInUsd(vault, vaultAssetToken, blockNow);
  const apy1DayPercentage = await getApyInNDaysPercentage(
    vault,
    vaultAssetToken,
    vaultToken,
    blockNow,
    block24hrsAgo,
    1
  );
  const apy7DaysPercentage = await getApyInNDaysPercentage(
    vault,
    vaultAssetToken,
    vaultToken,
    blockNow,
    block7daysAgo,
    7
  );
  return { tvlInUsd, apy1DayPercentage, apy7DaysPercentage };
}

const poolsFunction = async () => {
  const meta = await utils.getData(
    'https://metadata.perp.exchange/kantaban/optimism.json'
  );
  const pools = [];

  for (const {
    vault,
    vaultAsset,
    vaultToken,
    vaultBaseToken,
    vaultQuoteToken,
  } of meta.vaults) {
    const { tvlInUsd, apy1DayPercentage, apy7DaysPercentage } =
      await calculatePool(vault, vaultAsset, vaultToken);

    const symbol = await getSymbol(vaultToken);
    pools.push({
      pool: `${vaultToken}-optimism`.toLowerCase(),
      chain: 'Optimism',
      project: 'perpetual-protocol',
      symbol: symbol,
      tvlUsd: tvlInUsd,
      apyBase: apy1DayPercentage,
      apyBase7d: apy7DaysPercentage,
      underlyingTokens: [vaultBaseToken, vaultQuoteToken],
      url: 'https://vaults.perp.com/',
    });
  }

  return pools.filter((p) => utils.keepFinite(p));
};

module.exports = {
  timetravel: false,
  apy: poolsFunction,
};
