const {ethers} = require("ethers");
const sdk = require('@defillama/sdk');
const utils = require('../utils');
const {TEAHOUSE_VAULT_STAT_API_URL, TEAHOUSE_VAULT_CONTENT_API_URL, TEAHOUSE_WEBSITE_URL} = require('./config');
const bn = require('bignumber.js');
const {TEAHOUSE_VAULT_MANAGED_ABI} = require('./abi');


function generateVaultURL(chainName: string, vaultAddress: string): string {
    return `${TEAHOUSE_WEBSITE_URL}/${chainName}/${vaultAddress}`;
}

async function getManagedVaultData(): Promise<Vault[]> {
    const contentUrl = `${TEAHOUSE_VAULT_CONTENT_API_URL}/vaults`
    let {vaults} = await utils.getData(contentUrl)
    const filteredVaults = vaults.filter((el) => {
        return (el.isDeFi == false && el.isActive == true)
    }).map((el)=>mappingVaultData(el))
    return filteredVaults
}

function mappingVaultData(vault: any): Vault {
    const chain = vault.chain || ""
    const contract = vault.share
    const address = contract?.address || ""
    const shares = vault.share || {
        address: "Unknown",
        symbol: "Unknown",
        decimals: 18
    }
    const asset0 = vault.asset0 || {
        address: "Unknown",
        symbol: "Unknown",
        decimals: 18
    }
    const strategy = vault.name || ""
    const name = vault.name || ""
    const vaultMeta =  strategy
    const url = generateVaultURL(chain, address)
    const data = {
        address, chain, name, vaultMeta,  asset0, url,
        shares
    }
    return data
}

async function addTVLData(vaults: Vault[]): Promise<Vault[]> {
    let newVaults = []
    const vaultMap=[];
    const chainMap=new Map();
    vaults.forEach((el) => {
        const chain= el.chain
        if (!chain) return
        if (chainMap.has(chain)){
            const i =chainMap.get(chain)
            vaultMap[i].push(el)
        }else {
            const i = vaultMap.length
            vaultMap.push([el])
            chainMap.set(chain,i)

        }
    })
    for (let chain of chainMap.keys()){
        const i=chainMap.get(chain)
        const filteredVault=vaultMap[i]
        const chainVault = await addTvlData(chain,filteredVault)
        newVaults.push(...chainVault)
    }
    return newVaults
}

async function addTvlData(chain:string,vaults:Vault[]): Promise<Vault[]> {
    const newVaults = []
    const vaultAddr=vaults.map((el)=>el.address)
    const assetAddr=vaults.map((el)=>el.asset0.address)
    const prices = (await utils.getPrices(assetAddr, chain)).pricesByAddress
    const tvls = await getAssetTvl(chain,vaultAddr)
    for (let j=0;j<tvls.length;j++){
        const newVault= vaults[j]
        const tvl=tvls[j]
        const assetPrice=prices[assetAddr[j].toLowerCase()]
        const tvlUsd= tvl
            .multipliedBy(assetPrice)
            .dividedBy(new bn(10).pow(newVault.asset0.decimals)).toNumber()
        newVault.tvl = tvl
        newVault.asset0Price=assetPrice
        newVault.tvlUsd=tvlUsd
        newVaults.push(newVault)
    }
    return newVaults
}

async function addStatsData(vaults: Vault[]): Promise<Vault[]> {
    const statUrl = `${TEAHOUSE_VAULT_STAT_API_URL}/vaults/type/managed`
    let {vaults: stat} = await utils.getData(statUrl)
    return mergeVaultStat(vaults, stat)
}

function mergeVaultStat(vault: Vault[], stat: any[]): Vault[] {
    const newVaults = []
    const vaultMap = new Map();
    vault.forEach((el) => {
        const chain = el.chain || ""
        //key format: chain:address
        const key = `${chain}:${el.address.toLowerCase()}`
        vaultMap.set(key, el);
    })
    stat.forEach((el) => {
        //key format: chain:address
        const address = el.address || ""
        const chain = el.chain || ""
        const key = `${chain}:${address.toLowerCase()}`
        if (vaultMap.has(key)) {
            newVaults.push(mergeStat(el, vaultMap.get(key)));
        }
    })
    return newVaults
}

function mergeStat(stat: any, vault: Vault): Vault {
    return {
        ...vault,
        apy: stat.latestInfo.shareTokenApr,
    }
}

async function makeMulticall(abi: any, addresses: string[], chain: string, params:any[]| undefined| null, options) {
    const block = options.block || `latest`;
    const data = await sdk.api.abi.multiCall({
        abi,
        calls: addresses.map((address,i) => ({
            target: address,
            params: params? params[i]:[],
        })), chain, block
    });
    let outputByArray = []
    let outputByAddress = {}
    for (let i = 0; i < data.output.length; i++) {
        const key = addresses[i].toLowerCase();
        outputByArray.push(data.output[i].output);
        outputByAddress[key] = data.output[i].output;
    }
    return {
        outputByArray: outputByArray,
        outputByAddress: outputByAddress
    };
};

async function getAssetTvl(chain:string,vaultAddresses:string[]): Promise<bn[]> {
    const globalStateFn = TEAHOUSE_VAULT_MANAGED_ABI.find(
        (el) => el.name === `globalState`
    )
    const globalStates = (await makeMulticall(
        globalStateFn, vaultAddresses, chain,null, {}))
        .outputByArray
    const cycles= globalStates.map((el) => el.cycleIndex-1)
    const cycleStateFn = TEAHOUSE_VAULT_MANAGED_ABI.find(
        (el) => el.name === `cycleState`
    )
    const cycleStates = (await makeMulticall(
        cycleStateFn, vaultAddresses, chain,cycles, {}))
        .outputByArray
    const tvls= cycleStates.map((el) => new bn(el.fundValueAfterRequests || 0))
    return tvls
}







function convertToPool(vault: Vault): Pool {
    return {
        pool: `${vault.address}-${vault.chain}`,
        chain: vault.chain,
        symbol: vault.asset0.symbol,
        url: vault.url,
        project: 'teahouse-managed',
        tvlUsd: vault.tvlUsd,
        apyBase: vault.apy / 10000,
        apyReward: 0,
        underlyingTokens: [vault.asset0.address],
        rewardTokens: [],
        poolMeta: vault.vaultMeta,
    };
}

async function topLvl(_: number): Promise<Pool[]> {
    // step 1: get managed vault data
    let vaults=await getManagedVaultData()
    console.log(`vaults: ${vaults.length}`)
    // step 2: add TVL data
    vaults=await addTVLData(vaults)
    console.log(`vaults: ${vaults.length}`)
    // step 3: add apy data
    vaults=await addStatsData(vaults)
    console.log(`vaults: ${vaults.length}`)
    // step 4: convert to pool
    const pools = vaults.map((vault) => convertToPool(vault))
    return pools
}

interface Vault {
    address: string;
    name: string;
    chain: string;
    asset0: Token;
    share: Token;
    url: string;
    vaultMeta: string; //other info
    tvl:bn;
    asset0Price:number;
    tvlUsd?: number; // for lending protocols: tvlUsd = totalSupplyUsd - totalBorrowUsd
    apy?: number;
}

interface Token {
    symbol: string;
    decimals: number;
    address: string;
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
    topLvl
}
