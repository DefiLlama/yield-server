const lendingPoolABI = require('./lending-pool.json');
const sdk = require('@defillama/sdk');
const ethers = require('ethers');
const utils = require('../utils');
const abi = require('./abi')
const axios = require('axios');

const APYRegistry = "0x3161676467636Ce9027AC16268Fd351861b052b4";
const nativeToken = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";

const chainMapping = {
    ethereum: {
        chain: 'ethereum',
        chainId: '1',
        nativeToken: ethers.constants.AddressZero,
        decimals: 18,
        symbol: 'ETH',
    },
    avax: {
        chain: 'avax',
        chainId: '43114',
        nativeToken: ethers.constants.AddressZero,
        decimals: 18,
        symbol: 'AVAX',
    },
    base: {
        chain: 'base',
        chainId: '8453',
        nativeToken: ethers.constants.AddressZero,
        decimals: 18,
        symbol: 'ETH',
    }
}

const projectName = 'upshift';

const getApy = async () => {
    const poolInfos = [];

    const ethPools = await sdk.api.abi.call({
        target: APYRegistry,
        params: [chainMapping.ethereum.chainId],
        abi: abi.find(abi => abi.name === 'getPools'),
        chain: 'base'
    });


    const avaxPools = await sdk.api.abi.call({
        target: APYRegistry,
        params: [chainMapping.avax.chainId],
        abi: abi.find(abi => abi.name === 'getPools'),
        chain: 'base'
    });


    const basePools = await sdk.api.abi.call({
        target: APYRegistry,
        params: [chainMapping.base.chainId],
        abi: abi.find(abi => abi.name === 'getPools'),
        chain: 'base'
    });

   

    const ethereumPoolsInfo = await Promise.all(
        ethPools.output.map(async (pool) => {
            return await getPoolInfo(pool, 'ethereum');
        }),
    );

    poolInfos.push(...ethereumPoolsInfo);

    const avaxPoolsInfo = await Promise.all(
        avaxPools.output.map(async (pool) => {
            return await getPoolInfo(pool, 'avax');
        }),
    );

    poolInfos.push(...avaxPoolsInfo);

    const basePoolsInfo = await Promise.all(
        basePools.output.map(async (pool) => {
            return await getPoolInfo(pool, 'base');
        }),
    );

    poolInfos.push(...basePoolsInfo);

    return poolInfos;
}


const getPoolInfo = async (pool, chain) => {

    const symbol = (await sdk.api.abi.call({
        target: pool,
        abi: lendingPoolABI.find(abi => abi.name === 'symbol'),
        chain: chain,
    }))?.output;

    const underlying_token = (await sdk.api.abi.call({
        target: pool,
        abi: lendingPoolABI.find(abi => abi.name === 'asset'),
        chain: chain,
    }))?.output;

    const totalSupply = (await sdk.api.abi.call({
        target: pool,
        abi: lendingPoolABI.find(abi => abi.name === 'totalSupply'),
        chain: chain,
    }))?.output;

    const totalAsset = (await sdk.api.abi.call({
        target: pool,
        abi: lendingPoolABI.find(abi => abi.name === 'totalAssets'),
        chain: chain,
    }))?.output;

    const pool_decimals = (await sdk.api.abi.call({
        target: pool,
        abi: 'erc20:decimals',
        chain: chain,
    }))?.output;

    const underlyingDecimals = (await sdk.api.abi.call({
        target: underlying_token,
        abi: 'erc20:decimals',
        chain: chain,
    }))?.output;



    const priceKey = `${utils.formatChain(chain)}:${underlying_token}`;
    const underlyingPrice = (await axios.get(`https://coins.llama.fi/prices/current/${priceKey}`)).data.coins[priceKey]?.price;

    const tvlUsd = Number(ethers.utils.formatUnits(totalAsset, underlyingDecimals)) * underlyingPrice;


    const poolInfo = await sdk.api.abi.call({
        target: APYRegistry,
        params: [pool],
        abi: abi.find(abi => abi.name === 'getPoolInfo'),
        chain: 'base'
    });

    const rewardToken = poolInfo.output.rewardToken === nativeToken ? chainMapping[chain].nativeToken : poolInfo.output.rewardToken;
    const apyBase = poolInfo.output.apyBase / 100;
    const apyReward = poolInfo.output.apyReward / 100;

    if(apyReward === 0) {
        return {
            pool: `${pool}-${utils.formatChain(chain)}`,
            chain: utils.formatChain(chain),
            project: projectName,
            symbol: symbol,
            tvlUsd: tvlUsd,
            apyBase: apyBase,
            underlyingTokens: [underlying_token],
        }
    } else {
        return {
            pool: `${pool}-${utils.formatChain(chain)}`,
            chain: utils.formatChain(chain),
            project: projectName,
            symbol: symbol,
            tvlUsd: tvlUsd,
            apyBase: apyBase,
            apyReward: apyReward,
            rewardTokens: [rewardToken],
            underlyingTokens: [underlying_token],
        }
    }
    
};

module.exports = {
    timetravel: false,
    apy: getApy,
    url: 'https://www.upshift.finance/'
};