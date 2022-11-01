const utils = require('../utils');
const ethers = require('ethers');
const sdk = require('@defillama/sdk');

const poolsFunction = async () => {
  const dksdData = await utils.getData(
    'https://prod.kokoa-api.com/earn/status'
  ); //dKSD is a tokenized version of deposited KSD that is dynamically balanced at the APY rate

  const earnPool = {
    pool: `0x5e6215dfb33b1fb71e48000a47ed2ebb86d5bf3d`, //dKSD pool address
    chain: utils.formatChain('klaytn'),
    project: 'kokoa-finance',
    symbol: utils.formatSymbol('KSD'), //Users deposit KSD and claims the realized APY upon withdrawal
    tvlUsd: Number(dksdData.dKsdTotalSupply),
    apy: Number(dksdData.apy),
  };

  return [earnPool]; // Kokoa Finance Earn pool(the only pool) accrues APY yields via collateral management yields
};
const KSD_COIN_ID = 'kokoa-stable-dollar';
const KOKOA = '0xb15183d0d4d5e86ba702ce9bb7b633376e7db29f';
const cdpDataFunction = async () => {
  const URL = 'https://prod.kokoa-api.com/vaults/borrow';
  const data = (await utils.getData(URL)).vaults;
  const prices = (await utils.getPrices([`coingecko:${KSD_COIN_ID}`]))
    .pricesByAddress;
  const address = data.map((pool) => pool.address);
  const symbols = (
    await sdk.api.abi.multiCall({
      abi: 'erc20:symbol',
      calls: address.map((address) => {
        return { target: address };
      }),
      chain: 'klaytn',
      requery: false,
    })
  ).output.map((e) => e.output);
  return data
    .map((pool, index) => {
      const totalSupplyUsd =
        Number(pool.totalCollateralAmount) * Number(pool.collateralPrice);
      const totalBorrowUsd =
        Number(pool.totalBorrowedAmount) * prices[KSD_COIN_ID.toLowerCase()];
      return {
        pool: pool.address,
        project: 'kokoa-finance',
        symbol: symbols[index],
        chain: utils.formatChain('klaytn'),
        apy: 0,
        tvlUsd: totalSupplyUsd,
        apyRewardBorrow: Number(pool.rewardApr),
        apyBaseBorrow: Number(pool.stabilityFeeApr),
        totalSupplyUsd: totalSupplyUsd,
        rewardTokens: [KOKOA],
        totalBorrowUsd: totalBorrowUsd,
        ltv: Number(pool.liqLtvPercent) / 100,
        mintedCoin: 'KSD',
      };
    })
    .filter((e) => e.symbol);
};

const main = async () => {
  const poolData = await poolsFunction();
  const cdpData = await cdpDataFunction();
  return [...poolData, ...cdpData];
};

module.exports = {
  timetravel: false,
  apy: main,
  url: 'https://app.kokoa.finance/earn',
};
