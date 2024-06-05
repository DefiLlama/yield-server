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
      orderDirection: desca
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

     
      const rewardDataAVAX = await fetchRewardData(AVAXRewarder);
      const rewardDataGgAVAX = await fetchRewardData(ggAVAXRewarder);

     
      const lpWAVAX = poolAssets.find(asset => asset.symbol === 'LP-WAVAX');
      const lpGgAVAX = poolAssets.find(asset => asset.symbol === 'LP-ggAVAX');

     
      const feeWAVAX = volumeBasedFees.find(fee => fee.id === lpWAVAX.id);
      const feeGgAVAX = volumeBasedFees.find(fee => fee.id === lpGgAVAX.id);

      
      const apyResultsAVAX = lpWAVAX && feeWAVAX ? await calculateAPYWithVolumeBasedFees([lpWAVAX], rewardDataAVAX, [feeWAVAX], ggAVAXPrice, WAVAXPrice) : [];
      const apyResultsGgAVAX = lpGgAVAX && feeGgAVAX ? await calculateAPYWithVolumeBasedFees([lpGgAVAX], rewardDataGgAVAX, [feeGgAVAX], ggAVAXPrice, WAVAXPrice) : [];



      const allResults = [
        ...apyResultsAVAX.map(item => ({ ...item })),
        ...apyResultsGgAVAX.map(item => ({ ...item }))
      ];

     
      return allResults

  } catch (error) {
      console.error('Unhandled error:', error);
      return { AVAXRewarder: [], ggAVAXRewarder: [] };
  }
}




const oneDay = 86400;

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
