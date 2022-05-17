const utils = require('../utils');

let apyData;
const getPoolsData = async () => {
  const apyData = await utils.getData(
    'https://new-app-api-dot-angle-1.ew.r.appspot.com//v1/apr'
  );
  const tvlData = await utils.getData(
    'https://new-app-api-dot-angle-1.ew.r.appspot.com//v1/incentives'
  );

  const result = [];
  for (const gauge of Object.keys(apyData['gauges'])) {
    const address = apyData['gauges'][gauge]?.address;
    const pool = {
      pool: address,
      chain: 'Ethereum',
      project: 'angle',
      symbol: gauge,
      tvlUSD: tvlData.filter((gauge) => gauge.address === address)[0]?.tvl,
      apy: apyData['gauges'][gauge]?.details.max,
    };
    result.push(pool);
  }

  return result;
};

module.exports = {
  timetravel: false,
  apy: getPoolsData,
};

getPoolsData().then((result) => {
  console.log(result);
});
