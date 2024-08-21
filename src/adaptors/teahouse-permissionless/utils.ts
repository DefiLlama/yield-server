const {ethers} = require("ethers");
const sdk = require('@defillama/sdk');
const utils = require('../utils');
const {TEAHOUSE_VAULT_STAT_API_URL, TEAHOUSE_VAULT_CONTENT_API_URL, TEAHOUSE_WEBSITE_URL} = require('./config');
const bn = require('bignumber.js');
const {TEAHOUSE_VAULT_V3_ABI} = require('./abi');
const VAULT_DATA = require('./data.json');


const interval = 24 * 60 * 60 * 7

function generateVaultURL(chainName: string, vaultAddress: string): string {
    return `${TEAHOUSE_WEBSITE_URL}/${chainName}/${vaultAddress}`;
}

async function getVaultData(type: string): Promise<Vault[]> {
    const statUrl = `${TEAHOUSE_VAULT_STAT_API_URL}/vaults/type/${type}`
    let {vaults: stats} = await utils.getData(statUrl)
    const vaults = await addVaultInfo(stats)
    return vaults
}

async function addVaultInfo(stats: any[]): Promise<Vault[]> {
    const vaultMap = new Map();
    stats.forEach((el) => {
        const chain = el.network || ""
        //key format: chain:address
        const key = `${chain}:${el.address}`
        vaultMap.set(key, el);
    })
    const contentUrl = `${TEAHOUSE_VAULT_CONTENT_API_URL}/vaults`
    let infoList = [];
    let {vaults} = await utils.getData(contentUrl)
    vaults.forEach((el) => {
        //key format: chain:address
        const address = el.share?.address || ""
        const chain = el.chain || ""
        const key = `${chain}:${address}`
        if (vaultMap.has(key)) {
            infoList.push(mergeToVault(el, vaultMap.get(key)));
        }
    });
    return infoList
}

function mergeToVault(info: any, stat: any): Vault {
    const chain = info.chain || ""
    const contract = info.share
    const address = contract?.address || ""
    const name = info.name || ""
    const vaultMeta = info.feeTier || ""
    const url = generateVaultURL(chain, address)
    const shareDecimals = new bn(contract?.decimals || 0)
    const tokens = []
    let rewardTokens = []
    if (stat.latestInfo?.token0)
        tokens.push(getTokenData("0", info, stat))
    if (stat.latestInfo?.token1)
        tokens.push(getTokenData("1", info, stat))
    if (info.rewardTokens){
        rewardTokens=info.rewardTokens.map((el)=>({
            address:el.address,
            chain:chain,
            decimals:el.decimals,
            rewardBook:el.rewardBook,
            symbol:el.symbol,
            type:el.type
        }))
    }else {
        rewardTokens=[]
    }
    const data = {
        address, chain, name, vaultMeta, underlyingTokens: tokens, url,
        isAsset0Main: info.isAsset0Main, shareDecimals,rewardTokens:rewardTokens
    }
    return data
}

function getTokenData(num: string, info: any, stat: any): UnderlyingToken {
    const asset = `asset${num}`
    const tokenInfo = info[asset] || {}
    const statInfo = stat.latestInfo || {}
    const token = `token${num}`
    const tokenStat = statInfo[token] || {}
    const data = {
        name: token,
        address: tokenInfo.address || "",
        symbol: tokenInfo.symbol || "",
        decimals: tokenInfo.decimals || 0,
        tvl: tokenStat.tvl || "0",
        shareTokenApr: tokenStat.shareTokenApr || 0,
    }
    return data
}

function getUnderlyingToken(name: string, vault: Vault): UnderlyingToken {
    const token = vault.underlyingTokens.find((el) => el.name === name)
    return token
}

function updateRpcUrl(sdk: any, chain: string, chainId: number, rpcUrl: string) {
    const provider = new ethers.providers.StaticJsonRpcProvider(
        rpcUrl, {name: chain, chainId: chainId})
    sdk.api.config.setProvider(chain, provider);
}

async function makeCall(abi: any, address: string, chain: string, params = null, options) {
    const block = options.block || `latest`;
    console.log(`block: ${block}`, `chain: ${chain}`, `address: ${address}`, `params: ${params}`);
    console.log(`abi: ${JSON.stringify(abi)}`);
    const data = await sdk.api.abi.call({
        abi,
        target: address,
        params,
        // calls: addresses.map((address) => ({
        //     target: address,
        //     params,
        // })),
        chain, block
    });
    // let outputByArray = []
    // let outputByAddress = {}
    // for (let i = 0; i < data.output.length; i++) {
    //     const key = addresses[i].toLowerCase();
    //     outputByArray.push(data.output[i].output);
    //     outputByAddress[key] = data.output[i].output;
    // }
    return data.output
};


async function getLiquidityData(vault: Vault, block?: number): Promise<{
    tvl: bn, shareSupply: bn
}> {
    const chain = vault.chain
    const estimatedFn = `estimatedValueInToken${vault.isAsset0Main ? "0" : "1"}`
    const estimatedFnABI = TEAHOUSE_VAULT_V3_ABI.find(
        (el) => el.name === estimatedFn
    )
    const tvl = (await makeCall(
        estimatedFnABI, vault.address, chain, null, {block: block}))
    const supplyFnABI = TEAHOUSE_VAULT_V3_ABI.find(
        (el) => el.name === `totalSupply`
    )
    const shareSupply = (await makeCall(
        supplyFnABI, vault.address, chain, null, {block: block}))
    return {
        tvl: new bn(tvl || 0),
        shareSupply: new bn(shareSupply || 0)
    }
}

async function searchInterval(start: number, end: number, minInterval: number, check: (x: number) => Promise<boolean>): Promise<number> {
    if (end <= start + minInterval) return -1
    const mid = Math.floor((start + end) / 2)
    if (await check(mid)) {
        return mid
    } else {
        return searchInterval(mid, end, minInterval, check)
    }

}

async function checkVaultSupply(vault: Vault, time: number): Promise<boolean> {
    const [block] = await utils.getBlocksByTime([time], vault.chain)
    const supplyFnABI = TEAHOUSE_VAULT_V3_ABI.find(
        (el) => el.name === `totalSupply`
    )
    const shareSupply = (await makeCall(
        supplyFnABI, vault.address, vault.chain, null, {block: block}))
    const supply = new bn(shareSupply || 0)
    if (supply?.gt(0)) return true
    return false
}

async function addLiquidityData(vault: Vault, interval: number): Promise<Vault> {
    const chain = vault.chain
    const tokenName = vault.isAsset0Main ? "token0" : "token1"
    const token = getUnderlyingToken(tokenName, vault)
    const rewardTokens = vault.rewardTokens
    const {
        tvl, shareSupply
    } = await getLiquidityData(vault)
    const before = (Math.floor(Date.now() / 1000)) - interval
    const [blockBefore] = await utils.getBlocksByTime([before], chain)
    const {
        tvl: tvlBefore, shareSupply: shareSupplyBefore
    } = await getLiquidityData(vault, blockBefore)
    const prices = (await utils.getPrices([token.address], chain)).pricesByAddress
    const tokenKey = token.address.toLowerCase()
    const tokenDecimals = new bn(10).pow(token.decimals)
    const tvlUsd = new bn(tvl || 0).multipliedBy(prices[tokenKey]).div(tokenDecimals)
    const rewardApy = await getRewardTokenApy(chain,rewardTokens,tvlUsd)
    vault.tvlUsd = tvlUsd
    vault.tvl = new bn(tvl || 0)
    vault.tvlBefore = new bn(tvlBefore || 0)
    vault.shareSupply = new bn(shareSupply || 0)
    vault.shareSupplyBefore = new bn(shareSupplyBefore || 0)
    vault.rewardApy = rewardApy
    return vault
}

async function getRewardTokenApy(chain:string,rewardTokens:RewardToken[],tvlUsd:bn):Promise<number>{
    if (rewardTokens.length===0) return 0
    const addresses= rewardTokens.map((el)=>el.address.toLowerCase())
    const prices = (await utils.getPrices(addresses, chain)).pricesByAddress
    const totalApr = rewardTokens.reduce((acc,el)=>{
        const rewardBook = el.rewardBook
        const reward = new bn(rewardBook.totalReward)
        const totalRewardUsd = reward.multipliedBy(prices[el.address.toLowerCase()]).div(new bn(10).pow(el.decimals))
        const apy = totalRewardUsd
            .div(Number(rewardBook.endTime)-Number(rewardBook.startTime))
            .multipliedBy(365*24*60*60)
            .div(tvlUsd).multipliedBy(100)
        return acc.plus(apy)
    },new bn(0))
    return totalApr.toNumber()
}

async function updateBeforeLiquidityData(vault: Vault, time: number): Promise<Vault> {
    const chain = vault.chain
    const [blockBefore] = await utils.getBlocksByTime([time], chain)
    const {
        tvl: tvlBefore, shareSupply: shareSupplyBefore
    } = await getLiquidityData(vault, blockBefore)
    vault.tvlBefore = new bn(tvlBefore || 0)
    vault.shareSupplyBefore = new bn(shareSupplyBefore || 0)
    return vault
}


function calculateSharePrice(tvl: bn, supply: bn, decimals: bn): bn {
    if (supply.isZero()) {
        return new bn(0)
    }
    const price = tvl.multipliedBy(decimals).dividedBy(supply)
    return price
}

function calculateAPY(price: bn, priceBefore: bn, interval: number): number {
    if (priceBefore.isZero()) {
        return 0
    }
    const diff = price.minus(priceBefore)
    const diffPercent = diff.dividedBy(priceBefore)
    const diffPercentYear = diffPercent.dividedBy(interval).multipliedBy(365 * 24 * 60 * 60)
    return diffPercentYear
}

function convertToPool(vault: Vault): Promise<Pool> {
    const tokens = vault.underlyingTokens.map((el) => el.address)
    const rewardTokens = vault.rewardTokens.map((el) => el.address)
    const pool = {
        pool: `${vault.address}-${vault.chain}`,
        chain: vault.chain,
        symbol: vault.name,
        url: vault.url,
        project: 'teahouse-permissionless',
        tvlUsd: vault.tvlUsd.toNumber(),
        apyBase: vault.apy,
        apyReward: vault.rewardApy,
        underlyingTokens: tokens,
        rewardTokens: rewardTokens,
        poolMeta: vault.vaultMeta,
    }
    return pool;
}

function getVaultData2(): Promise<Vault[]> {
    return VAULT_DATA
}

async function topLvl(_: number): Promise<Pool[]> {
    // step 1: get vault data
    // const vaultType = 'permissionless'
    // const vaults = await getVaultData(vaultType)
    const vaults = getVaultData2()
    const interval = 24 * 60 * 60
    updateRpcUrl(sdk, 'arbitrum', 42161, "https://rpc.ankr.com/arbitrum")
    updateRpcUrl(sdk, 'boba', 288, "https://lightning-replica.boba.network/")
    updateRpcUrl(sdk, 'mantle', 5000, "https://rpc.mantle.xyz/")
    const pools = []

    for (let vault of vaults) {
        //step 2: get TVL and Share Supply
        vault = await addLiquidityData(vault, interval)
        const decimals = new bn(10).pow(vault.shareDecimals)
        //step 3: if TVL is 0, update the start time
        // if (!(vault.shareSupplyBefore?.gt(0))) {
        //     const end = Math.floor(Date.now() / 1000)
        //     const start = end - interval
        //     const minInterval = 60 * 60 * 24
        //     const check = async (x: number) => {
        //         return await checkVaultSupply(vault, x)
        //     }
        //     const newStart = await searchInterval(start, end, minInterval, check)
        //     if (newStart === -1) continue
        //     vault = await updateBeforeLiquidityData(vault, newStart)
        // }
        //step 4: calculate share token price
        const sharePrice = calculateSharePrice(vault.tvl, vault.shareSupply, decimals)
        const sharePriceBefore = calculateSharePrice(vault.tvlBefore, vault.shareSupplyBefore, decimals)
        //step 5: calculate apy
        const apy = calculateAPY(sharePrice, sharePriceBefore, interval)
        vault.apy = apy * 100
        const pool = await convertToPool(vault)
        pools.push(pool)
    }
    return pools
}

interface Vault {
    address: string;
    name: string;
    chain: string;
    underlyingTokens: Array<UnderlyingToken>;
    rewardTokens: Array<RewardToken>;
    isAsset0Main: boolean;
    url: string;
    vaultMeta: string; //other info
    shareDecimals: number;
    tvlUsd?: bn;
    tvl?: bn;
    tvlBefore?: bn;
    shareSupply?: bn;
    shareSupplyBefore?: bn;
    apy?: number;
    rewardApy?: number;
}

interface UnderlyingToken {
    name: string;
    address: string;
    symbol: string;
    decimals: number;
    tvl: string;
    shareTokenApr: number;
}

interface RewardBook {
    address: string;
    endTime: string;
    startTime: string;
    totalReward: string;
}

interface RewardToken {
    address: string;
    chain: string;
    decimals: number;
    rewardBook: RewardBook;
    symbol: string;
    type: string;
}

interface Performance {
    tvlUsd: number;
    apy: number;
}

interface Pool {
    pool: string;
    chain: string;
    project: string;
    symbol: string;
    tvlUsd: number; // for lending protocols: tvlUsd = totalSupplyUsd - totalBorrowUsd
    apyBase?: number;
    apyReward?: number;
    rewardTokens?: Array<string>;
    underlyingTokens?: Array<string>;
    poolMeta?: string;
    url?: string;
    // optional lending protocol specific fields:
    apyBaseBorrow?: number;
    apyRewardBorrow?: number;
    totalSupplyUsd?: number;
    totalBorrowUsd?: number;
    ltv?: number; // btw [0, 1]
}

module.exports = {
    topLvl,
}
