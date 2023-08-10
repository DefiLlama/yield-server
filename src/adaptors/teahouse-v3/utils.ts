const utils = require('../utils');
const {TEAHOUSE_VAULT_STAT_API_URL, TEAHOUSE_VAULT_CONTENT_API_URL, TEAHOUSE_WEBSITE_URL} = require('./config');
const bn= require('bignumber.js');

function generateVaultURL(chainName: string, vaultAddress: string): string {
    return `${TEAHOUSE_WEBSITE_URL}/${chainName}/${vaultAddress}`;
}

async function getVaultData(type:string): Promise<Vault[]> {
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
        const key=`${chain}:${el.address}`
        vaultMap.set(key, el);
    })
    const contentUrl = `${TEAHOUSE_VAULT_CONTENT_API_URL}/vaults`
    let infoList = [];
    let {vaults} = await utils.getData(contentUrl)
    vaults.forEach((el) => {
        //key format: chain:address
        const address = el.share?.address || ""
        const chain = el.chain || ""
        const key=`${chain}:${address}`
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
    const vaultName=info.feeTier? `${name} (${info.feeTier})`:name;
    const vaultMeta = info.feeTier || ""
    const url = generateVaultURL(chain, address)
    const tokens = []
    if (stat.latestInfo?.token0)
        tokens.push(getTokenData("0", info, stat))
    if (stat.latestInfo?.token1)
        tokens.push(getTokenData("1", info, stat))
    const data = {
        address, chain, name:vaultName,vaultMeta, underlyingTokens: tokens, url,
        isAsset0Main: info.isAsset0Main,
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

function getUnderlyingToken(name:string,vault: Vault): UnderlyingToken {
    const token = vault.underlyingTokens.find((el) => el.name === name)
    return token
}


async function calculatePerformance(vault: Vault, _: number): Promise<Performance> {
    const tokenName=vault.isAsset0Main?"token0":"token1"
    const token = getUnderlyingToken(tokenName, vault)
    const prices = await utils.getPrices([token.address], vault.chain)
    //how to get native eth price？ what is the address of native eth?
    const tokenPrice = prices.pricesByAddress[token.address.toLowerCase()] || 0
    const tokenTvl = new bn(token.tvl)
    const tokenDecimals = new bn(10).pow(token.decimals)
    const performance = {
        tvlUsd: tokenTvl.multipliedBy(tokenPrice).div(tokenDecimals).toNumber(),
        // shareTokenApr is 1e-6, so we need to divide by 10000
        apy: token.shareTokenApr/10000,
    }
    return performance;
}

function mergeToPoolData(vault: Vault, performance: Performance): Promise<Pool> {
    const tokens = vault.underlyingTokens.map((el) => el.address)
    const pool = {
        pool: vault.address,
        chain: vault.chain,
        symbol: vault.name,
        url: vault.url,
        project: 'teahouse-v3',
        tvlUsd: performance.tvlUsd,
        apyBase: performance.apy,
        apyReward: 0,
        underlyingTokens: tokens,
        rewardTokens: [],
        poolMeta: vault.vaultMeta,
        apyBaseBorrow: 0,
        apyRewardBorrow: 0,
        totalSupplyUsd: 0,
        totalBorrowUsd: 0,
        ltv: 0,
    }
    return pool;
}

async function topLvl(timestamp: number): Promise<Pool[]> {
    // step 1: get vault data
    const vaultType = 'permissionless'
    const vaults = await getVaultData(vaultType)
    const pools = await Promise.all(
        vaults.map(async (el) =>
            // step 3: merge to pool data
        mergeToPoolData(el,
            // step 2: calculate performance
            await calculatePerformance(el, timestamp))
        )
    )
    return pools
}

interface Vault {
    address: string;
    name: string;
    chain: string;
    underlyingTokens: Array<UnderlyingToken>;
    isAsset0Main: boolean;
    url: string;
    vaultMeta: string; //other info
}

interface UnderlyingToken {
    name: string;
    address: string;
    symbol: string;
    decimals: number;
    tvl: string;
    shareTokenApr: number;
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
    getVaultData,
    calculatePerformance,
    topLvl,
}
