const sdk = require('@defillama/sdk')
const utils = require('../utils')
const abi = require('./abis/abi.json')

const arbitrumGlpManagerAddress = '0x321F653eED006AD1C29D174e17d96351BDe22649'
const arbitrumFeeGmxTrackerAddress = '0xd2D1162512F927a7e282Ef43a362659E4F2a728F'
const arbitrumInflationGmxTrackerAddress = '0x908C4D94D34924765f1eDc22A1DD098397c59dD4'
const arbitrumFeeGlpTrackerAddress = '0x4e971a87900b931fF39d1Aad67697F49835400b6'
const arbitrumInflationGlpTrackerAddress = '0x1aDDD80E6039594eE970E5872D247bf0414C8903'

const avalancheGlpManagerAddress = '0xe1ae4d4b06A5Fe1fc288f6B4CD72f9F8323B107F'
const avalancheFeeGmxTrackerAddress = '0x4d268a7d4C16ceB5a606c173Bd974984343fea13'
const avalancheInflationGmxTrackerAddress = '0x2bD10f8E93B3669b6d42E74eEedC65dd1B0a1342'
const avalancheFeeGlpTrackerAddress = '0xd2D1162512F927a7e282Ef43a362659E4F2a728F'
const avalancheInflationGlpTrackerAddress = '0x9e295B5B976a184B14aD8cd72413aD846C299660'

const secondsPerYear = 31536000

async function getAdjustedAmount(pTarget, pChain, pAbi) {
    let decimals = await sdk.api.abi.call({
        target: pTarget,
        abi: 'erc20:decimals',
        chain: pChain
    })
    let supply = await sdk.api.abi.call({
        target: pTarget,
        abi: pAbi,
        chain: pChain
    })

    return pAbi == abi['tokensPerInterval'] ? supply.output * 10 ** -decimals.output * secondsPerYear : supply.output * 10 ** -decimals.output
}

async function getGlpTvl(pChain) {
    let tvl = await sdk.api.abi.call({
        target: pChain == 'arbitrum' ? arbitrumGlpManagerAddress : avalancheGlpManagerAddress,
        abi: abi['getAumInUsdg'],
        chain: pChain,
        params: [false]
    })

    return tvl.output * 10 ** -18
}

async function getPoolGmx(pChain, pInflationTrackerAddress, pStakedGmx, pStakedEsGmx, pFeeGmx, pInflationGmx, pPriceData) {
    const tvlGmx = pStakedGmx * pPriceData.gmx.usd
    const tvlEsGmx = pStakedEsGmx * pPriceData.gmx.usd
    const yearlyFeeGmx = pChain == 'arbitrum' ? pFeeGmx * pPriceData.ethereum.usd : pFeeGmx * pPriceData['avalanche-2'].usd
    const yearlyInflationGmx = pInflationGmx * pPriceData.gmx.usd
    const apyFee = (yearlyFeeGmx) / tvlGmx * 100
    const apyInflation = (yearlyInflationGmx) / tvlEsGmx * 100

    return {
        pool: pInflationTrackerAddress,
        chain: utils.formatChain(pChain),
        project: 'gmx',
        symbol: utils.formatSymbol('GMX'),
        tvlUsd: tvlGmx + tvlEsGmx,
        apy: apyFee + apyInflation,
    }
}

async function getPoolGlp(pChain ,pTvl, pInflationTrackerAddress, pFeeGlp, pInflationGlp, pPriceData) {
    const yearlyFeeGlp = pChain == 'arbitrum' ? pFeeGlp * pPriceData.ethereum.usd : pFeeGlp * pPriceData['avalanche-2'].usd
    const yearlyInflationGlp = pInflationGlp * pPriceData.gmx.usd
    const apyFee = (yearlyFeeGlp) / pTvl * 100
    const apyInflation = (yearlyInflationGlp) / pTvl * 100

    return {
        pool: pInflationTrackerAddress,
        chain: utils.formatChain(pChain),
        project: 'glp',
        symbol: utils.formatSymbol('GLP'),
        tvlUsd: parseFloat(pTvl),
        apy: apyFee + apyInflation,
    }
}

const getPools = async () => {
    let pools = []

    const priceData =  await utils.getData('https://api.coingecko.com/api/v3/simple/price?ids=gmx%2Cethereum%2Cavalanche-2&vs_currencies=usd')

    const arbitrumStakedGmx = await getAdjustedAmount(arbitrumFeeGmxTrackerAddress, 'arbitrum', 'erc20:totalSupply')
    const arbitrumStakedEsGmx = await getAdjustedAmount(arbitrumInflationGmxTrackerAddress, 'arbitrum', 'erc20:totalSupply')
    const arbitrumFeeGmx = await getAdjustedAmount(arbitrumFeeGmxTrackerAddress, 'arbitrum', abi['tokensPerInterval'])
    const arbitrumInflationGmx = await getAdjustedAmount(arbitrumInflationGmxTrackerAddress, 'arbitrum', abi['tokensPerInterval'])
    pools.push(await getPoolGmx('arbitrum', arbitrumInflationGmxTrackerAddress, arbitrumStakedGmx, arbitrumStakedEsGmx, arbitrumFeeGmx, arbitrumInflationGmx, priceData))

    const arbitrumFeeGlp = await getAdjustedAmount(arbitrumFeeGlpTrackerAddress, 'arbitrum', abi['tokensPerInterval'])
    const arbitrumInflationGlp = await getAdjustedAmount(arbitrumInflationGlpTrackerAddress, 'arbitrum', abi['tokensPerInterval'])
    pools.push(await getPoolGlp('arbitrum', await getGlpTvl('arbitrum'), arbitrumInflationGlpTrackerAddress, arbitrumFeeGlp, arbitrumInflationGlp, priceData))

    const avalancheStakedGmx = await getAdjustedAmount(avalancheFeeGmxTrackerAddress, 'avax', 'erc20:totalSupply')
    const avalancheStakedEsGmx = await getAdjustedAmount(avalancheInflationGmxTrackerAddress, 'avax', 'erc20:totalSupply')
    const avalancheFeeGmx = await getAdjustedAmount(avalancheFeeGmxTrackerAddress, 'avax', abi['tokensPerInterval'])
    const avalancheInflationGmx = await getAdjustedAmount(avalancheInflationGmxTrackerAddress, 'avax', abi['tokensPerInterval'])
    pools.push(await getPoolGmx('avalanche', avalancheInflationGmxTrackerAddress, avalancheStakedGmx, avalancheStakedEsGmx, avalancheFeeGmx, avalancheInflationGmx, priceData))

    const avalancheFeeGlp = await getAdjustedAmount(avalancheFeeGlpTrackerAddress, 'avax', abi['tokensPerInterval'])
    const avalancheInflationGlp = await getAdjustedAmount(avalancheInflationGlpTrackerAddress, 'avax', abi['tokensPerInterval'])
    pools.push(await getPoolGlp('avalanche', await getGlpTvl('avax'), avalancheInflationGlpTrackerAddress, avalancheFeeGlp, avalancheInflationGlp, priceData))

    return pools;
}

module.exports = {
    timetravel: false,
    apy: getPools,
}