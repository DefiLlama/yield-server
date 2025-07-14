const axios = require('axios');

const getApy = async () => {
  // time-based scheduling: only run once a day at hour 0 (midnight)
  const currentHour = new Date().getHours();
  if (currentHour !== 0) {
    console.log(
      `zkp2p: Skipping execution at hour ${currentHour} (runs once daily at midnight)`
    );
    return [];
  }

  try {
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

    if (!rows || rows.length === 0) {
      console.error('No data found in Dune query');
      return [];
    }

    // Find the most recent data by date
    const latestData = rows.reduce((latest, current) => {
      const currentDate = new Date(current.day);
      const latestDate = new Date(latest.day);
      return currentDate > latestDate ? current : latest;
    });

    const pool = {
      pool: 'zkp2p-main-pool-base',
      chain: 'Base',
      project: 'zkp2p',
      symbol: 'ZKP2P',
      tvlUsd: Number(latestData.tvl),
      apy: Number(latestData.protocol_apr_pct),
      url: 'https://zkp2p.xyz',
      poolMeta: 'APR is a TVL-weighted median across payment rail pools (e.g., Venmo, Zelle). Details: https://docs.zkp2p.xyz/user-guides/for-sellers/calculating-apr',
    };

    console.log('ZKP2P: Fetched fresh data from Dune');
    return [pool];
  } catch (error) {
    console.error('Error fetching zkp2p yield data:', error.message);
    return [];
  }
};

module.exports = {
  timetravel: false,
  apy: getApy,
};
