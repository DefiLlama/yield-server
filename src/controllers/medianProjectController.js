const minify = require('pg-minify');

const { pgp, conn } = require('../utils/dbConnection');
const customHeader = require('../utils/customHeader');

const tableName = 'median_project';

// get full content from median table
const getMedianProject = async (project) => {
  const query = minify(
    `
    SELECT
        timestamp,
        "medianAPY",
        "uniquePools"
    FROM
        $<table:name>
    WHERE project = $<project>
    ORDER BY
        timestamp ASC
    `,
    { compress: true }
  );

  const response = await conn.query(query, { table: tableName, project });

  if (!response) {
    return new AppError(`Couldn't get ${tableName} data`, 404);
  }

  res.set(customHeader()).status(200).json({
    status: 'success',
    data: response,
  });
};

module.exports = {
  getMedianProject,
};
