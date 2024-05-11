const AWS = require('aws-sdk');
AWS.config.update({
  accessKeyId: process.env.aws_access_key_id,
  secretAccessKey: process.env.aws_secret_access_key,
  region: process.env.region,
});
const S3 = require('aws-sdk/clients/s3');
const validator = require('validator');

const AppError = require('../../utils/appError');
const poolsEnrichedColumns = require('../../utils/enrichedColumns');
const { readFromS3 } = require('../../utils/s3');

let poolsEnriched = {
  lastUpdate: Date.now(),
  data: null
}

async function getPoolsEnrichedData(){
  if(poolsEnriched.lastUpdate < (Date.now() - 10*60*1e3) || poolsEnriched.data === null){
    // this leads to race conditions but thats fine
    const data = await readFromS3(
      'llama-apy-prod-data',
      'enriched/dataEnriched.json'
    );
    poolsEnriched = {
      lastUpdate: Date.now(),
      data
    }
  }
  return poolsEnriched.data
}

const getPoolEnriched = async (req, res) => {
  // querystring (though we only use it for pool values on /pool pages)
  // note: change to route param later -> /pools/:pool
  const configID = req.query.pool;
  if (!configID || !validator.isUUID(configID))
    return res.status(400).json('invalid configID!');

  const queryString = req.query;

  let columns = poolsEnrichedColumns;
  columns = queryString !== undefined ? [...columns, 'url'] : columns;

  const data = await getPoolsEnrichedData()
  res
    .status(200)
    .json({
      status: 'success',
      data: data.filter((t) => t.pool == configID),
    });
};

const getPoolsEnrichedOld = async (req, res) => {
  const queryString = req.query;

  // add pool_old (the pool field from the adpaters == address)
  let columns = [...poolsEnrichedColumns, 'pool_old'];

  let data = await getPoolsEnrichedData()
  if (Object.keys(queryString).length > 0) {
    data = data.filter((pool) => {
      const key = Object.keys(queryString)[0];
      const val = queryString[key];
      return pool[key] === val;
    });
  }

  res.status(200).json({
    status: 'success',
    data,
  });
};

const getPoolsBorrow = async (req, res) => {
  const data = await Promise.all(
    ['pools', 'lendBorrow'].map((p) =>
      readFromS3('defillama-datasets', `yield-api/${p}`)
    )
  );

  if (!data) {
    return new AppError("Couldn't retrieve data", 404);
  }

  // pools == supply side apy values
  const pools = data[0].data;
  // lendBorrow == borrow side apy values
  const lendBorrow = data[1];

  // join supply side fields (all enriched fields) onto borrow object
  const poolsBorrow = lendBorrow
    .map((p) => {
      const poolSupplySide = pools.find((i) => i.pool === p.pool);
      if (poolSupplySide === undefined) return null;

      return {
        ...poolSupplySide,
        apyBaseBorrow: p.apyBaseBorrow,
        apyRewardBorrow: p.apyRewardBorrow,
        totalSupplyUsd: p.totalSupplyUsd,
        totalBorrowUsd: p.totalBorrowUsd,
        debtCeilingUsd: p.debtCeilingUsd,
        ltv: p.ltv,
        borrowable: p.borrowable,
        mintedCoin: p.mintedCoin,
        borrowFactor: p.borrowFactor,
        rewardTokens: p.rewardTokens,
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.totalSupplyUsd - a.totalSupplyUsd);

  res.status(200).json({
    status: 'success',
    data: poolsBorrow,
  });
};

module.exports = { getPoolEnriched, getPoolsEnrichedOld, getPoolsBorrow };
