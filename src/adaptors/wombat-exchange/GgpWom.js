const { util } = require('@defillama/sdk');
const { ethers } = require('ethers');
const { getPrices } = require('../utils');
const config = require('./configAVAX');
const { gql, request } = require('graphql-request');

const poolData = gql`
  query GetPoolData {
    pools(where:{id:"0xbba43749efc1bc29ea434d88ebaf8a97dc7aeb77"}) {
      assets {
        id
        symbol
        liabilityUSD
        totalSharedFeeUSD      
      }
    }
  }
`;

const volumeBasedFeesQuery = gql`
query VolumeBasedFees($currentBlock: Int!, $oneDayAgoBlock: Int!) {
    assetsNow: assets(block: {number: $currentBlock}) {
        id
        symbol
        totalSharedFeeUSD
        liabilityUSD
    }
    assets24hAgo: assets(block: {number: $oneDayAgoBlock}) {
        id
        symbol
        totalSharedFeeUSD
        liabilityUSD
    }
}
`;

async function fetchVolumeBasedFees() {
    try {
        
        const currentBlockFetch = await provider.getBlockNumber();

        const currentBlock = currentBlockFetch - 2;//make sure to have  block data 

        const oneDayAgoBlock = currentBlock - (24 * 60 * 30);
        
        const response = await request('https://api.thegraph.com/subgraphs/name/wombat-exchange/wombat-exchange-avax', volumeBasedFeesQuery, {
            currentBlock,
            oneDayAgoBlock
        });
        
        const assetsNow = response.assetsNow;
        const assets24hAgo = response.assets24hAgo;

        const feeChanges = assetsNow.map((assetNow, index) => {
            const asset24hAgo = assets24hAgo[index];
            const feeChange = parseFloat(assetNow.totalSharedFeeUSD) - parseFloat(asset24hAgo.totalSharedFeeUSD);
            return {
                id: assetNow.id,
                symbol: assetNow.symbol,
                feeChange
            };
        });

        

        return feeChanges;
        
    } catch (error) {
        console.error('Error fetching volume-based fees:', error);
        return [];
    }
}




async function fetchPoolData() {
    try {
        const response = await request('https://api.thegraph.com/subgraphs/name/wombat-exchange/wombat-exchange-avax', poolData);
        if (response && response.pools && response.pools.length > 0) {
            const { assets } = response.pools[0];
            return assets;
        } else {
            console.error('No pool data found in the response.');
            return [];
        }
    } catch (error) {
        console.error('Error fetching pool data:', error);
        return [];
    }
}

async function calculateTVL(poolAssets) {
    const tvl = {};
    poolAssets.forEach(asset => {
        tvl[asset.symbol] = parseFloat(asset.liabilityUSD);
    });
    return tvl;
}

const provider = new ethers.JsonRpcProvider(config.avax.rpcUrl);

const rewarderABI = [
    {
        "inputs": [{"internalType":"uint256","name":"","type":"uint256"}],
        "name": "rewardInfo",
        "outputs": [
            {"internalType":"contract IERC20","name":"rewardToken","type":"address"},
            {"internalType":"uint96","name":"tokenPerSec","type":"uint96"},
            {"internalType":"uint128","name":"accTokenPerShare","type":"uint128"},
            {"internalType":"uint128","name":"distributedAmount","type":"uint128"}
        ],
        "stateMutability": "view",
        "type": "function"
    },
    {
        "inputs": [],
        "name": "rewardTokens",
        "outputs": [
            {"internalType":"contract IERC20[]","name":"tokens","type":"address[]"}
        ],
        "stateMutability": "view",
        "type": "function"
    }
];

const AVAXRewarder = new ethers.Contract(config.avax.AVAXRewarder, rewarderABI, provider);

function weiToTokens(weiAmount, decimals = 18) {
    return Number(weiAmount) / 10 ** decimals;
}

function calculateDailyReward(tokenPerSec, decimals = 18) {
    const secPerDay = 86400;
    const dailyRewardInWei = BigInt(tokenPerSec) * BigInt(secPerDay);
    return weiToTokens(dailyRewardInWei, decimals); 
}

async function fetchRewardAndConvertData(contract) {
    try {
        const rewardInfo = await contract.rewardInfo(0); 
        return {
            rewardTokenAddress: rewardInfo.rewardToken,
            dailyTokensDistributed: calculateDailyReward(rewardInfo.tokenPerSec),
        };
    } catch (error) {
        console.error('Error fetching reward data:', error);
        return null;
    }
}


async function fetchRewardData(contract) {
    try {
        const rewardInfoToken0 = await contract.rewardInfo(0); 
        const rewardInfoToken1 = await contract.rewardInfo(1);
        return [
            {
                rewardTokenAddress: rewardInfoToken0.rewardToken,
                dailyTokensDistributed: calculateDailyReward(rewardInfoToken0.tokenPerSec),
            },
            {
                rewardTokenAddress: rewardInfoToken1.rewardToken,
                dailyTokensDistributed: calculateDailyReward(rewardInfoToken1.tokenPerSec),
            }
        ];
        
    } catch (error) {
        console.error('Error fetching reward data:', error);
        return null;
    }
}

async function getGgAVAXPrice() {
    return await getPrices(['0x69260B9483F9871ca57f81A90D91E2F96c2Cd11d'], 'avax');
}

async function getWAVAXPrice() {
    return await getPrices(['0xad6742a35fb341a9cc6ad674738dd8da98b94fb1'], 'bsc');
}



async function calculateAPYWithVolumeBasedFees(poolAssets, rewardData, volumeBasedFees, ggAVAXPrice, WAVAXPrice) {
    const apy_export = []; 

    try {
        const ggPriceValue = parseFloat(ggAVAXPrice?.pricesBySymbol?.ggp) || 0;
        const wavaxPriceValue = parseFloat(WAVAXPrice?.pricesBySymbol?.wom) || 0;

        const tvl = await calculateTVL(poolAssets);
        
        poolAssets.forEach((asset, index) => {
            const tvlForToken = tvl[asset.symbol];
            const volumeBasedFeeChange = volumeBasedFees[index] ? parseFloat(volumeBasedFees[index].feeChange) : 0;
        
            const dailyEmissionsValue = rewardData.reduce((acc, data) => {
                const tokenPrice = data.rewardTokenAddress.toLowerCase() === '0x69260b9483f9871ca57f81a90d91e2f96c2cd11d' ? ggPriceValue : wavaxPriceValue;
                return acc + (parseFloat(data.dailyTokensDistributed) * tokenPrice);
            }, 0);
        
            const annualEmissionsValue = dailyEmissionsValue * 365;
            const apyReward = annualEmissionsValue / tvlForToken * 100;
            const apyBase = ((1 + volumeBasedFeeChange / tvlForToken) ** 365 - 1) * 100;
        
            apy_export.push({
                pool: asset.id,
                project: 'wombat-exchange',  // Ensure this is correct
                chain: 'avax',
                tvlUsd: tvlForToken,
                symbol: asset.symbol,
                apyReward: Number(apyReward.toFixed(2)),  // Store as a number
                apyBase: Number(apyBase.toFixed(2)),      // Store as a number
                rewardTokens: rewardData.map(data => data.rewardTokenAddress) // Ensure this field exists
            });
        });

        return apy_export;  
        
    } catch (error) {
        console.error('Error calculating APY with volume-based fees:', error);
        return [];
    }
}

async function GGP() {
    try {
        const poolAssets = await fetchPoolData();
        if (!poolAssets.length) {
            console.error('No pool assets fetched.');
            return;
        }

        const rewardData = await fetchRewardData(AVAXRewarder);
        if (!rewardData) {
            console.error('No reward data fetched.');
            return;
        }

        const volumeBasedFees = await fetchVolumeBasedFees();
        if (!volumeBasedFees.length) {
            console.error('No volume-based fees fetched.');
            return;
        }

        const ggAVAXPrice = await getGgAVAXPrice();
        const WAVAXPrice = await getWAVAXPrice();   

        
        const apy_export = await calculateAPYWithVolumeBasedFees(poolAssets, rewardData, volumeBasedFees, ggAVAXPrice, WAVAXPrice);
        
        const uniqueApyExport = apy_export.filter(
            (v, i, a) => a.findIndex((v2) => v2.pool === v.pool) === i
        );

        console.log('Unique APY Export:', uniqueApyExport);

        return uniqueApyExport;

    } catch (error) {
        console.error('Unhandled error:', error);
    }
}




module.exports = {
    GGP,
}