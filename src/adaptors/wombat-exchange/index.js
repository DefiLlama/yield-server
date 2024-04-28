const { util } = require('@defillama/sdk');
const { gql, request } = require('graphql-request');
const config = require('./config.js');
const { ethers } = require('ethers');
const { getPrices } = require('../utils');



const prevBlockQuery = gql`
  query Blocks($timestamp_lte: BigInt = "") {
    blocks(
      first: 1
      orderBy: timestamp
      orderDirection: desc
      where: { timestamp_lte: $timestamp_lte }
    ) {
      number
      timestamp
    }
  }
`;

const volumesQuery = gql`
  query Volumes($block: Int = 0) {
    assetsNow: assets {
      id
      symbol
      totalSharedFeeUSD
      liabilityUSD
    }
    assets24hAgo: assets(block: { number: $block }) {
      id
      symbol
      totalSharedFeeUSD
      liabilityUSD
    }
  }
`;

const aprQuery = gql`
  query Apr {
    assets(where: { id_not: "0x0000000000000000000000000000000000000000" }) {
      id
      symbol
      liabilityUSD
      totalSharedFeeUSD
      womBaseApr
      avgBoostedApr
      totalBonusTokenApr
      underlyingToken {
        id
      }
    }
  }
`;



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

const avax = {
  rpcUrl: 'https://api.avax.network/ext/bc/C/rpc',
  ggAVAXRewarder:'0x3Bc2Fe0f365c8559510419b8b10e43e275D8aDC8',
  AVAXRewarder: '0x5EF81b1b2F4629f99E6724475003Be3796059638',
}

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

const provider = new ethers.JsonRpcProvider(avax.rpcUrl);

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
          return [];
      }

      // Fetch reward data for both rewarders concurrently
      const [rewardDataAVAX, rewardDataGgAVAX] = await Promise.all([
          fetchRewardData(AVAXRewarder),
          fetchRewardData(ggAVAXRewarder)
      ]);

      const volumeBasedFees = await fetchVolumeBasedFees();
      if (!volumeBasedFees.length) {
          console.error('No volume-based fees fetched.');
          return [];
      }

      const ggAVAXPrice = await getGgAVAXPrice();
      const WAVAXPrice = await getWAVAXPrice();   

      // Calculate APY for AVAXRewarder
      const apyResultsAVAX = await calculateAPYWithVolumeBasedFees(poolAssets, rewardDataAVAX, volumeBasedFees, ggAVAXPrice, WAVAXPrice, 'AVAXRewarder');

      // Calculate APY for ggAVAXRewarder
      const apyResultsGgAVAX = await calculateAPYWithVolumeBasedFees(poolAssets, rewardDataGgAVAX, volumeBasedFees, ggAVAXPrice, WAVAXPrice, 'ggAVAXRewarder');

      console.log('APY Results from AVAXRewarder:', apyResultsAVAX);
      console.log('APY Results from ggAVAXRewarder:', apyResultsGgAVAX);
      
      return { AVAXRewarder: apyResultsAVAX, ggAVAXRewarder: apyResultsGgAVAX };

  } catch (error) {
      console.error('Unhandled error:', error);
      return { AVAXRewarder: [], ggAVAXRewarder: [] };
  }
}


GGP();


/*const oneDay = 86400;

const apy = async () => {
  apy_export = [];
  for (chain in config) {
    const timestampPrior = +(new Date() / 1000).toFixed(0) - oneDay;

    const blockPrior = (
      await request(config[chain]['BLOCK_ENDPOINT'], prevBlockQuery, {
        timestamp_lte: timestampPrior,
      })
    ).blocks[0].number;

    const { assetsNow, assets24hAgo } = await request(
      config[chain]['APR_ENDPOINT'],
      volumesQuery,
      {
        block: +blockPrior,
      }
    );

    const { assets: aprs } = await request(
      config[chain]['APR_ENDPOINT'],
      aprQuery
    );

    const assets = aprs.map((pool) => {
      const aprData = aprs.find((apr) => apr.id === pool.id) || {};
      const feeNow = assetsNow.find((apr) => apr.id === pool.id) || {};
      const fee24hAgo = assets24hAgo.find((apr) => apr.id === pool.id) || {};

      // Projected baseApy estimated by feeUSD collected in 24h
      let apyBase =
        (((Number(feeNow.totalSharedFeeUSD) -
          Number(fee24hAgo.totalSharedFeeUSD)) /
          2) *
          365 *
          100) /
          Number(pool.liabilityUSD) || 0;

      let apyReward =
        (Number(aprData.womBaseApr) + Number(aprData.totalBonusTokenApr)) * 100;

      apy_export.push({
        pool: aprData.id,
        project: 'wombat-exchange',
        chain: chain,
        tvlUsd: Number(pool.liabilityUSD) || 0,
        symbol: pool.symbol,
        apyReward,
        apyBase,
        underlyingTokens: [pool.underlyingToken.id],
        rewardTokens: [config[chain]['WOM_ADDRESS']],
      });
    });
  }
  const ggpResult = await GGP();
  apy_export = apy_export.concat(ggpResult);

  // remove dupes on lptoken
  return apy_export.filter(
    (v, i, a) => a.findIndex((v2) => v2.pool === v.pool) === i
  );
};

module.exports = {
  apy,
  timetravel: false,
  url: 'https://app.wombat.exchange/pool',
};
*/