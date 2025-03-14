const utils = require('../utils');
const ethers = require('ethers');
const sdk = require('@defillama/sdk');

const LP_Mapping = {
  '0x029e2A1B2bb91B66bd25027E1C211E5628dbcb93': 'oETH-oUSDT',
  '0x2E9269B718cc816De6A9E3C27E5bdb0F6A01b0ac': 'oUSDT-oUSDC',
  '0xc320066b25B731A11767834839Fe57f9b2186f84': 'oUSDT-KDAI',
  '0xE75a6A3a800A2C5123e67e3bde911Ba761FE0705': 'KSP-oUSDT',
  '0x4B50d0e4F29bF5B39a6234B11753fDB3b28E76Fc': 'oXRP-KDAI',
};

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
      permitFailure: true,
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
        symbol:
          symbols[index] === 'KSLP' ? LP_Mapping[pool.address] : symbols[index],
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
        poolMeta: symbols[index] === 'KSLP' ? 'KlaySwap LP' : null,
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
