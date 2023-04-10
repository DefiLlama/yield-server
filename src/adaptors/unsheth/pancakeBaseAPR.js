const ethers  = require('ethers');
const {pancakeSwapSubgraphUrl, BNB_BLOCK_TIME_SECONDS, feeRate, BINANCE_RPC_URL} = require('./constants');
const contract_addresses = require('./contract_addresses');
const axios = require('axios');

async function getBlockNumberOf24HoursAgo(providerUrl) {
    const provider = new ethers.providers.JsonRpcProvider(providerUrl);
  
    // Get the current block number
    const currentBlockNumber = await provider.getBlockNumber();
  
    // Estimate the number of blocks in the past 24 hours
    const blocksIn24Hours = Math.floor(24 * 60 * 60 / BNB_BLOCK_TIME_SECONDS);
  
    // Get the block number of approximately 24 hours ago
    let approxBlockNumber = currentBlockNumber - blocksIn24Hours;
  
    return approxBlockNumber;
  }
  
  async function get24HourTradingVolume(pairAddress, providerUrl) {
    const blockNumberOneDayAgo = await getBlockNumberOf24HoursAgo(providerUrl);
  
    const query = `
      {
        pair(id: "${pairAddress.toLowerCase()}", block: { number: ${blockNumberOneDayAgo} }) {
          volumeUSD
        }
      }
    `;
  
    const response = await fetch(pancakeSwapSubgraphUrl, {
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
  
    const responseCurrent = await fetch(pancakeSwapSubgraphUrl, {
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
  // Query the reserves and token data from the PancakeSwap Subgraph
  const query = `
    {
      pair(id: "${pairAddress.toLowerCase()}") {
        reserve0
        reserve1
        token0 {
          symbol
          derivedBNB
        }
        token1 {
          symbol
          derivedBNB
        }
      }
    }
  `;

  const response = await fetch(pancakeSwapSubgraphUrl, {
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

  // Get the prices of each token in BNB
  const price0InBNB = parseFloat(pairData.token0.derivedBNB);
  const price1InBNB = parseFloat(pairData.token1.derivedBNB);

  // Get the price of BNB in USD
  const priceKey = `coingecko:binancecoin`;
  const ethPrice = (await axios.get(`https://coins.llama.fi/prices/current/${priceKey}`)).data.coins[priceKey]?.price;

  // Calculate the total value of the liquidity pool's reserves in USD
  const totalValueInUSD =
    (reserve0 * price0InBNB + reserve1 * price1InBNB) * ethPrice;

  return totalValueInUSD;
}

async function calculateTotalAPRPancake(pairAddress, providerUrl) {
  const volume24h = await get24HourTradingVolume(pairAddress, providerUrl);

  // Calculate the total value of the liquidity pool's reserves in USD
  const totalValueInUSD = await getTotalValueInUSD(pairAddress, providerUrl);

  if (totalValueInUSD === null) {
    return "Unable to calculate the total value in USD. Please check the pair address and try again.";
  }

  // Calculate the trading fees APR based on the 24-hour volume and total liquidity in USD

  const feesIn24Hours = (volume24h * feeRate);
  
  const feesInYear = feesIn24Hours * 365;

  const tradingFeesAPR = (feesInYear / totalValueInUSD) * 100;

  const totalAPR = tradingFeesAPR; //+ pancakeRewardsAPR;

  return totalAPR;
}


async function getLatestAPRPancake() {
  try {
    const pairAddress = contract_addresses.BNBpancakeSwapLP;
    const providerUrl = BINANCE_RPC_URL;

    const totalAPR = await calculateTotalAPRPancake(pairAddress, providerUrl);
    return totalAPR;
  }
  catch(err){
    console.log(err);
  }
}

module.exports = {
  getLatestAPRPancake,
};