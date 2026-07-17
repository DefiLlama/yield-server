const sdk = require('@defillama/sdk');
const {sushiSwapSubgraphUrl, BLOCK_TIME_SECONDS, feeRate} = require('./constants');
const contract_addresses = require('./contract_addresses');
const axios = require('axios');
const { getPriceApiData } = require('../utils');

async function getBlockNumberOf24HoursAgo() {
    const currentBlockNumber = (await sdk.api.util.getLatestBlock('ethereum')).number;
  
    // Estimate the number of blocks in the past 24 hours
    const blocksIn24Hours = Math.floor(24 * 60 * 60 / BLOCK_TIME_SECONDS);
  
    // Get the block number of approximately 24 hours ago
    let approxBlockNumber = currentBlockNumber - blocksIn24Hours;
  
    return approxBlockNumber;
  }
  
  async function get24HourTradingVolume(pairAddress) {
    const blockNumberOneDayAgo = await getBlockNumberOf24HoursAgo();
  
    const query = `
      {
        pair(id: "${pairAddress.toLowerCase()}", block: { number: ${blockNumberOneDayAgo} }) {
          volumeUSD
        }
      }
    `;
  
    const response = await fetch(sushiSwapSubgraphUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query }),
    });
  
    const data = await response.json();
    const previousVolumeUSD = parseFloat(data.data.pair?.volumeUSD || 0);
  
    const queryCurrent = `
      {
        pair(id: "${pairAddress.toLowerCase()}") {
          volumeUSD
        }
      }
    `;
  
    const responseCurrent = await fetch(sushiSwapSubgraphUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: queryCurrent }),
    });
  
    const dataCurrent = await responseCurrent.json();
    const currentVolumeUSD = parseFloat(dataCurrent.data.pair?.volumeUSD || 0);
  
    // Calculate the 24-hour trading volume
    const volume24h = currentVolumeUSD - previousVolumeUSD;
    return volume24h;
  }

async function getTotalValueInUSD(pairAddress) {
  // Query the reserves and token data from the SushiSwap Subgraph
  const query = `
    {
      pair(id: "${pairAddress.toLowerCase()}") {
        reserve0
        reserve1
        token0 {
          symbol
          derivedETH
        }
        token1 {
          symbol
          derivedETH
        }
      }
    }
  `;

  const response = await fetch(sushiSwapSubgraphUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
  });

  const data = await response.json();
  const pairData = data.data.pair;

  if (!pairData) {
    return null;
  }

  // Get the reserves of each token
  const reserve0 = parseFloat(pairData.reserve0);
  const reserve1 = parseFloat(pairData.reserve1);

  // Get the prices of each token in ETH
  const price0InETH = parseFloat(pairData.token0.derivedETH);
  const price1InETH = parseFloat(pairData.token1.derivedETH);

  // Get the price of ETH in USD
  const priceKey = `ethereum:${contract_addresses.WETH}`;
  const ethPrice = (await getPriceApiData(`/prices/current/${priceKey}`)).coins[priceKey]?.price;

  // Calculate the total value of the liquidity pool's reserves in USD
  const totalValueInUSD =
    (reserve0 * price0InETH + reserve1 * price1InETH) * ethPrice;

  return totalValueInUSD;
}

async function calculateTotalAPRSushi(pairAddress) {
  const volume24h = await get24HourTradingVolume(pairAddress);

  // Calculate the total value of the liquidity pool's reserves in USD
  const totalValueInUSD = await getTotalValueInUSD(pairAddress);

  if (totalValueInUSD === null) {
    return "Unable to calculate the total value in USD. Please check the pair address and try again.";
  }

  // Calculate the trading fees APR based on the 24-hour volume and total liquidity in USD

  const feesIn24Hours = (volume24h * feeRate);
  
  const feesInYear = feesIn24Hours * 365;

  const tradingFeesAPR = (feesInYear / totalValueInUSD) * 100;

  const totalAPR = tradingFeesAPR; //+ sushiRewardsAPR;

  return totalAPR;
}


async function getLatestAPRSushi() {
  try {
    const pairAddress = contract_addresses.sushiSwapLP;

    const totalAPR = await calculateTotalAPRSushi(pairAddress);
    return totalAPR;
  }
  catch(err){
    console.log("here in sushi");
    console.log(err);
  }
}

module.exports = {
  getLatestAPRSushi,
};
