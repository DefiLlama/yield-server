const fs = require('fs');

const storeAggs = require('../src/api/storeAggs');
const AWS = require('aws-sdk');
const { boostrapDB } = require('./bootstrapTable');
const credentials = new AWS.SharedIniFileCredentials({ profile: 'defillama' });
AWS.config.credentials = credentials;

(async () => {
  // where pools.json is a full database snapshot of the last pool object per day
  // containing timestamp, apy, pool fields
  const p = './pools.json';
  let data = JSON.parse(fs.readFileSync(p));
  // scale apy to daily return value (for mu/sigma calc)
  T = 365;
  data = data.map((p) => ({
    ...p,
    return: (1 + p['apy'] / 100) ** (1 / T) - 1,
  }));
  const dataDB = boostrapDB(data, 'aggs');
  const response = await storeAggs(dataDB);
  console.log(response.body);
})();
