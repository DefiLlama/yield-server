const { pgp, connect } = require('../utils/dbConnection');

const tableName = 'stat';

// get full content from stat table
const getStat = async () => {
  const conn = await connect();

  const query = `
    SELECT
        "configID",
        count,
        "meanAPY",
        "mean2APY",
        "meanDR",
        "mean2DR",
        "productDR"
    FROM
        $<table:name>
    `;
  const response = await conn.query(query, { table: tableName });

  if (!response) {
    return new AppError(`Couldn't get ${tableName} data`, 404);
  }

  // reformat
  const responseObject = {};
  for (const p of response) {
    const configID = p.configID;
    responseObject[configID] = { configID, ...p };
  }

  return responseObject;
};

// multi row insert (update on conflict)
const insertStat = async (payload) => {
  const conn = await connect();

  const columns = [
    'configID',
    'count',
    'meanAPY',
    'mean2APY',
    'meanDR',
    'mean2DR',
    'productDR',
  ];
  const cs = new pgp.helpers.ColumnSet(columns, { table: tableName });

  const query =
    pgp.helpers.insert(payload, cs) +
    ' ON CONFLICT("configID") DO UPDATE SET ' +
    cs.assignColumns({ from: 'EXCLUDED', skip: 'configID' });

  const response = await conn.result(query);

  if (!response) {
    return new AppError(`Couldn't insert/update ${tableName} data`, 404);
  }

  return response;
};

module.exports = {
  getStat,
  insertStat,
};
