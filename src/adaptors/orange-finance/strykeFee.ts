const BigNumber = require('bignumber.js');
const { TickMath } = require('@uniswap/v3-sdk')
const JSBI = require('jsbi')
const { getAmountsForLiquidity } = require('./price')

export type DopexStrikeEarningPerVault = {
  sqrtPriceX96?: string
  compound?: string
  donation?: string
  strike: {
    id: string
    pool: string
    tickLower: number
    tickUpper: number
    totalLiquidity: string
    totalShares: string
  }
  pool: string
  shares: string
  user: string
  handler: string
}

type Token = {
  id: string
  decimals: string
  derivedETH: string
}
type Pool = {
  id: string
  token0Price: string
  token1Price: string
  token0: Token
  token1: Token
}

type Vault = {
  id: string
  totalAssets: string
  totalSupply: string
  decimals: string
  isTokenPairReversed: boolean
}

const calculateAPR = (
  earningList: DopexStrikeEarningPerVault[],
  vault: Vault,
  pool: Pool,
  ethPriceUSD: typeof BigNumber
) => {
  const strikeEarningAmounts = getStrikeEarningAmounts(earningList)

  const result = strikeEarningAmounts.map(earn => {
    const {
      amount0ETH: feeAmount0ETH,
      amount1ETH: feeAmount1ETH,
      totalAmountETH: feeTotalAmountETH,
      totalAmountUSD: feeTotalAmountUSD,
    } = convertAmountToETH(
      earn.fee.amount0,
      earn.fee.amount1,
      pool.token0,
      pool.token1,
      ethPriceUSD
    )
    const {
      amount0ETH: premiumAmount0ETH,
      amount1ETH: premiumAmount1ETH,
      totalAmountETH: premiumTotalAmountETH,
      totalAmountUSD: premiumTotalAmountUSD,
    } = convertAmountToETH(
      earn.premium.amount0,
      earn.premium.amount1,
      pool.token0,
      pool.token1,
      ethPriceUSD
    )
    const {
      amount0: orangeAmount0,
      amount1: orangeAmount1,
      totalAmountETH: orangeTotalAmountETH,
      totalAmountUSD: orangeTotalAmountUSD,
    } = convertAmountToETH(
      earn.orange.amount0,
      earn.orange.amount1,
      pool.token0,
      pool.token1,
      ethPriceUSD
    )

    const feeAPR = feeTotalAmountETH
      .multipliedBy(earn.rate)
      .dividedBy(orangeTotalAmountETH)
      .multipliedBy(365)

    const premiumAPR = premiumTotalAmountETH
      .multipliedBy(earn.rate)
      .dividedBy(orangeTotalAmountETH)
      .multipliedBy(365)

    return {
      id: earn.tokenId,
      feeAmount0ETH,
      feeAmount1ETH,
      feeTotalAmountETH,
      feeTotalAmountETHOfOrangeShare: feeTotalAmountETH.multipliedBy(earn.rate),
      premiumAmount0ETH,
      premiumAmount1ETH,
      premiumTotalAmountETH,
      premiumTotalAmountETHOfOrangeShare: premiumTotalAmountETH.multipliedBy(earn.rate),
      orangeAmount0,
      orangeAmount1,
      orangeTotalAmountETH,
      feeAPR,
      premiumAPR,
      rate: earn.rate,
    }
  })
  const baseToken = vault.isTokenPairReversed ? pool.token1 : pool.token0
  const tvl = new BigNumber(vault.totalAssets)
    .dividedBy(10 ** Number(baseToken.decimals))
    .times(baseToken.derivedETH)
    .times(ethPriceUSD)

  const res = result.reduce(
    (acc, sp) => {
      acc.fee = acc.fee.plus(sp.feeTotalAmountETHOfOrangeShare)
      acc.premium = acc.premium.plus(sp.premiumTotalAmountETHOfOrangeShare)
      acc.orange = acc.orange.plus(sp.orangeTotalAmountETH)
      return acc
    },
    { fee: new BigNumber(0), premium: new BigNumber(0), orange: new BigNumber(0) }
  )

  return {
    vaultId: vault.id,
    fee: res.fee,
    premium: res.premium,
    orange: res.orange,
    dopexApr: !res.orange.isZero()
      ? res.fee.plus(res.premium).dividedBy(res.orange).multipliedBy(365)
      : new BigNumber(0),
    strikePremimFee: result,
    tvl,
  }
}

const getStrikeEarningAmounts = (earningList: DopexStrikeEarningPerVault[]) => {
  if (!earningList) return []

  return earningList.map(earning => {
    if (!earning.strike || !earning.sqrtPriceX96 || !earning.donation || !earning.compound) {
      return {
        tokenId: earning.strike.id,
        fee: { amount0: JSBI.BigInt(0), amount1: JSBI.BigInt(0) },
        premium: { amount0: JSBI.BigInt(0), amount1: JSBI.BigInt(0) },
        orange: { amount0: JSBI.BigInt(0), amount1: JSBI.BigInt(0) },
        rate: new BigNumber(0),
      }
    }
    const sqrtPriceX96 = JSBI.BigInt(earning.sqrtPriceX96)
    const sqrtRatioAX96 = TickMath.getSqrtRatioAtTick(earning.strike.tickLower)
    const sqrtRatioBX96 = TickMath.getSqrtRatioAtTick(earning.strike.tickUpper)
    const donations = JSBI.BigInt(earning.donation)
    const compouds = JSBI.BigInt(earning.compound)
    const premiumAmounts = getAmountsForLiquidity(
      sqrtPriceX96,
      sqrtRatioAX96,
      sqrtRatioBX96,
      donations
    )
    const feeAmounts = getAmountsForLiquidity(sqrtPriceX96, sqrtRatioAX96, sqrtRatioBX96, compouds)

    const totalLiquidity = new BigNumber(earning.strike.totalLiquidity.toString())
    const shares = new BigNumber(earning.shares.toString() ?? 0)
    const totalShares = new BigNumber(earning.strike.totalShares.toString())
    const orangeShareRate =
      shares.isZero() || totalShares.isZero() ? new BigNumber(0) : shares.dividedBy(totalShares)
    const orangeLiquidity = totalLiquidity.multipliedBy(orangeShareRate).toFixed(0)

    const orangeAmounts = getAmountsForLiquidity(
      sqrtPriceX96,
      sqrtRatioAX96,
      sqrtRatioBX96,
      JSBI.BigInt(Number(orangeLiquidity))
    )

    return {
      tokenId: earning.strike.id,
      fee: feeAmounts,
      premium: premiumAmounts,
      orange: orangeAmounts,
      rate: shares.dividedBy(totalShares),
    }
  })
}

const convertAmountToETH = (
  amount0: typeof JSBI,
  amount1: typeof JSBI,
  token0: Token,
  token1: Token,
  ethPriceUSD: typeof BigNumber
) => {
  const token0Decimal = 10 ** Number(token0.decimals)
  const token1Decimal = 10 ** Number(token1.decimals)

  const decimalizeAmount0 = new BigNumber(amount0.toString()).div(token0Decimal)
  const decimalizeAmount1 = new BigNumber(amount1.toString()).div(token1Decimal)

  const amount0ETH = decimalizeAmount0.times(token0.derivedETH)
  const amount1ETH = decimalizeAmount1.times(token1.derivedETH)
  const totalAmountETH = amount0ETH.plus(amount1ETH)
  const totalAmountUSD = totalAmountETH.times(ethPriceUSD)

  return {
    amount0: decimalizeAmount0,
    amount1: decimalizeAmount1,
    amount0ETH,
    amount1ETH,
    totalAmountETH,
    totalAmountUSD,
  }
}

module.exports = { calculateAPR, getStrikeEarningAmounts }