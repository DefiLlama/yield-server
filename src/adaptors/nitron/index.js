const utils = require('../utils');
const BigNumber = require('bignumber.js');
const sdk = require("@defillama/sdk");
const { default: axios } = require('axios');
const { getTotalCdpSharesUSD, getCdpTotalSupply, getCdpModBalances, getRewardSchemes, getAllBorrowAssets, getDebtInfos, getModBalances, getUSDValues, getAllStrats, calculateInterestAPY, calculateLendAPY, getParams, getTokenAprArr } = require('./helper');

const bnOrZero = (number) => {
  return new BigNumber(number ?? 0)
}

const apr = async () => {
  const tokens = await(await utils.getData('https://api.carbon.network/carbon/coin/v1/tokens?pagination.limit=10000')).tokens
  const allAssets = await getAllBorrowAssets()
  const debtInfos = await getDebtInfos()
  const modAccBalances = await getModBalances()
  const cdpModAccBalances = await getCdpModBalances()
  const allStrats = await getAllStrats()
  const denomToGeckoIdMap = (await axios.get(`https://api-insights.carbon.network/info/denom_gecko_map`)).data.result.gecko
  const usdValues = await getUSDValues(tokens, denomToGeckoIdMap)
  const params = await getParams()
  const cdpTotalSupplies = await getCdpTotalSupply()
  const rewardSchemes = await getRewardSchemes()
  const result = []
  for (const asset of allAssets) {
    const tokenInfo = tokens.find((o) => o.denom === asset.denom)
    const strategy = allStrats.find((o) => o.name === asset.rate_strategy_name)
    const usdValue = new BigNumber(usdValues[asset.denom].usd ?? 0)
    const symbol = tokenInfo.symbol.toUpperCase()
    const debtInfo = debtInfos.find((o) => o.denom === asset.denom)
    const assetBalance = modAccBalances.find((o) => o.denom === asset.denom)
    const cdpAssetBalance = (cdpModAccBalances.find((o) => o.denom === `cibt/${asset.denom}`))?.available ?? 0
    const cdpTotalSupply = (cdpTotalSupplies.find((o) => o.denom === `cibt/${asset.denom}`))?.amount ?? 0
    
    const { total_principal, utilization_rate } = debtInfo
    const totalSupplied = new BigNumber(total_principal ?? 0).plus(new BigNumber(assetBalance?.available ?? 0))
    const totalSuppliedUSD = totalSupplied.multipliedBy(usdValue).shiftedBy(-Number(tokenInfo.decimals)).toNumber()
    const totalBorrowedUSD = (new BigNumber(total_principal)).multipliedBy(usdValue).shiftedBy(-Number(tokenInfo.decimals)).toNumber()
    const tvl = totalSuppliedUSD - totalBorrowedUSD
    //  Borrow APY
    const borrowAPY = calculateInterestAPY(debtInfo, strategy)
    //  Supply APY
    const supplyAPY = calculateLendAPY(borrowAPY, debtInfo, params)
    //  get reward apy
    const totalCdpTokenUSD = getTotalCdpSharesUSD(debtInfo, params, borrowAPY, tokenInfo.decimals, bnOrZero(cdpTotalSupply), cdpAssetBalance, usdValue)
    const { tokenAprArr: tokenSupplyRewardArr, overallRewardApr: overallSupplyRewardApr } = await getTokenAprArr(rewardSchemes, usdValues, tokens, "lend", asset.denom, totalCdpTokenUSD)
    const { tokenAprArr, overallRewardApr } = await getTokenAprArr(rewardSchemes, usdValues, tokens, "borrow", asset.denom, totalBorrowedUSD)
    const rewardTokensSupply = tokenSupplyRewardArr?.map((o) => o.denom)
    const rewardTokensBorrow = tokenAprArr?.map((o) => o.denom)
    result.push({
      pool: asset.denom.toString(),
      chain: utils.formatChain('Carbon'),
      project: 'nitron',
      symbol: symbol,
      // Supply and Borrowing
      tvlUsd: tvl, // totalSuppliedUSD - totalBorrowedUSD
      apyBase: supplyAPY.shiftedBy(2).toNumber(), // supplying in %
      apyReward: overallSupplyRewardApr?.shiftedBy(2)?.toNumber() ?? 0, // APY from rewards in %
      rewardTokens: [...new Set([...rewardTokensSupply ,...rewardTokensBorrow])],
      underlyingTokens: [asset.denom],
      apyBaseBorrow: borrowAPY.shiftedBy(2).toNumber(),
      apyRewardBorrow: overallRewardApr?.shiftedBy(2)?.toNumber() ?? 0,
      totalSupplyUsd: totalSuppliedUSD,
      totalBorrowUsd: totalBorrowedUSD,
      ltv: new BigNumber(asset.loan_to_value).shiftedBy(-2).toNumber() / 100,
    });
  }
  return result;
};

module.exports = {
  timetravel: false,
  apy: apr,
  url: 'https://app.dem.exchange/nitron',
};
