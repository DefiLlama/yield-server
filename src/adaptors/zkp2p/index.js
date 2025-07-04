const axios = require('axios');

// Cache the data for 24 hours to avoid hitting Dune API limits
let cachedData = null;
let lastFetchTime = 0;
const CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours in milliseconds

const getApy = async () => {
  try {
    const now = Date.now();
    
    // Return cached data if it's still valid
    if (cachedData && (now - lastFetchTime) < CACHE_DURATION) {
      console.log('ZKP2P: Using cached data');
      return cachedData;
    }

    // Fetch data from Dune API with your API key
    const response = await axios.get(
      'https://api.dune.com/api/v1/query/5416872/results',
      {
        headers: {
          'X-Dune-API-Key': process.env.DUNE_API_KEY
        },
        timeout: 10000
      }
    );

    const duneData = response.data;
    const rows = duneData.result.rows;

    // Find the most recent data by date
    const latestData = rows.reduce((latest, current) => {
      const currentDate = new Date(current.day);
      const latestDate = new Date(latest.day);
      return currentDate > latestDate ? current : latest;
    });
    
    if (!latestData) {
      console.error('No data found in Dune query');
      return [];
    }

    const pool = {
      pool: 'zkp2p-main-pool-base',
      chain: 'Base',
      project: 'zkp2p',
      symbol: 'ZKP2P',
      tvlUsd: Number(latestData.tvl),
      apy: Number(latestData.protocol_apr_pct),
      url: 'https://zkp2p.com',
    };

    // Cache the result
    cachedData = [pool];
    lastFetchTime = now;
    
    console.log('ZKP2P: Fetched fresh data from Dune');
    return cachedData;
  } catch (error) {
    console.error('Error fetching zkp2p yield data:', error.message);
    
    // Return cached data if available, even if expired
    if (cachedData) {
      console.log('ZKP2P: Returning stale cached data due to error');
      return cachedData;
    }
    
    return [];
  }
};

module.exports = {
  timetravel: false,
  apy: getApy,
};
