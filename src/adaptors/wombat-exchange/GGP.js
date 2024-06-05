const { gql, request} = require('graphql-request');
const { avax } = require('./config.js');
const { ethers } = require('ethers');
const { getPrices } = require('../utils');

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
const provider = new ethers.providers.JsonRpcProvider(avax.rpcUrl);

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

const AVAXRewarder = new ethers.Contract(avax.AVAXRewarder, rewarderABI, provider);
const ggAVAXRewarder = new ethers.Contract(avax.ggAVAXRewarder, rewarderABI, provider);

function weiToTokens(weiAmount, decimals = 18) {
    return Number(weiAmount) / 10 ** decimals;
}

function calculateDailyReward(tokenPerSec, decimals = 18) {
    const secPerDay = 86400;
    const dailyRewardInWei = BigInt(tokenPerSec) * BigInt(secPerDay);
    return weiToTokens(dailyRewardInWei, decimals); 
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
  
        poolAssets.forEach((asset) => {
            const feeData = volumeBasedFees.find(fee => fee.id === asset.id);
            if (!feeData) {
                console.error(`No volume-based fee data found for asset with ID ${asset.id}`);
                return;
            }
  
            const tvlForToken = parseFloat(asset.liabilityUSD);
            const volumeBasedFeeChange = parseFloat(feeData.feeChange);
  
            console.log(`Calculating for ${asset.symbol}: TVL=${tvlForToken}, FeeChange=${volumeBasedFeeChange}`);
  
            const dailyEmissionsValue = rewardData.reduce((acc, data) => {
                const tokenPrice = data.rewardTokenAddress.toLowerCase() === '0x69260b9483f9871ca57f81a90d91e2f96c2cd11d' ? ggPriceValue : wavaxPriceValue;
                return acc + (parseFloat(data.dailyTokensDistributed) * tokenPrice);
            }, 0);
  
            const annualEmissionsValue = dailyEmissionsValue * 365;
            const apyReward = annualEmissionsValue / tvlForToken * 100;
  
            // More aggressive scaling for apyBase
            const dailyFeeImpact = (volumeBasedFeeChange / tvlForToken) * 10000; // Scaling the fee change
            const dailyBaseAPY = (1 + dailyFeeImpact / 100);
            const apyBase = ((dailyBaseAPY ** 365) - 1) * 100;
  
            console.log(`APY Results for ${asset.symbol}: APY Reward=${apyReward.toFixed(2)}, APY Base=${apyBase.toFixed(2)}`);
  
            apy_export.push({
                pool: asset.id,
                project: 'wombat-exchange',
                chain: 'avax',
                tvlUsd: tvlForToken,
                symbol: asset.symbol,
                apyReward: Number(apyReward.toFixed(2)),
                apyBase: Number(apyBase.toFixed(2)),
                rewardTokens: rewardData.map(data => data.rewardTokenAddress)
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
        // Fetch all necessary data
        const poolAssets = await fetchPoolData();
        const volumeBasedFees = await fetchVolumeBasedFees();
        const ggAVAXPrice = await getGgAVAXPrice();
        const WAVAXPrice = await getWAVAXPrice();
  
        if (!poolAssets.length || !volumeBasedFees.length) {
            console.error('No pool assets or volume-based fees fetched.');
            return { AVAXRewarder: [], ggAVAXRewarder: [] };
        }
  
        // Fetch reward data for both rewarders
        const rewardDataAVAX = await fetchRewardData(AVAXRewarder);
        const rewardDataGgAVAX = await fetchRewardData(ggAVAXRewarder);
  
        // Filter for specific pools
        const lpWAVAX = poolAssets.find(asset => asset.symbol === 'LP-WAVAX');
        const lpGgAVAX = poolAssets.find(asset => asset.symbol === 'LP-ggAVAX');
  
        // Filter corresponding volume-based fees
        const feeWAVAX = volumeBasedFees.find(fee => fee.id === lpWAVAX.id);
        const feeGgAVAX = volumeBasedFees.find(fee => fee.id === lpGgAVAX.id);
  
        // Ensure pool and fee data exists before calculating APY
        const apyResultsAVAX = lpWAVAX && feeWAVAX ? await calculateAPYWithVolumeBasedFees([lpWAVAX], rewardDataAVAX, [feeWAVAX], ggAVAXPrice, WAVAXPrice) : [];
        const apyResultsGgAVAX = lpGgAVAX && feeGgAVAX ? await calculateAPYWithVolumeBasedFees([lpGgAVAX], rewardDataGgAVAX, [feeGgAVAX], ggAVAXPrice, WAVAXPrice) : [];
  
        console.log('APY Results from AVAXRewarder:', apyResultsAVAX);
        console.log('APY Results from ggAVAXRewarder:', apyResultsGgAVAX);
  
        const allResults = [
          ...apyResultsAVAX.map(item => ({ ...item })),
          ...apyResultsGgAVAX.map(item => ({ ...item }))
        ];
  
        console.log('all APY results:', allResults);
        return allResults
  
    } catch (error) {
        console.error('Unhandled error:', error);
        return { AVAXRewarder: [], ggAVAXRewarder: [] };
    }
  }