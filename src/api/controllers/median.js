const minify = require('pg-minify');

const AppError = require('../../utils/appError');
const { conn } = require('../db');
const { customHeader } = require('../../utils/headers');

const getMedian = async (req, res) => {
  const query = minify(
    `
    SELECT
        timestamp,
        "uniquePools",
        "medianAPY"
    FROM
        median
    ORDER BY
        timestamp ASC
    `,
    { compress: true }
  );

  const response = await conn.query(query);

  if (!response) {
    return new AppError(`Couldn't get data`, 404);
  }

  res.status(200).json(response);
};

const getMedianProject = async (req, res) => {
  const project = req.params.project;
  const query = minify(
    `
    SELECT
        timestamp,
        "medianAPY",
        "uniquePools"
    FROM
        median_project
    WHERE 
        project = $<project>
    ORDER BY
        timestamp ASC
    `,
    { compress: true }
  );

  const response = await conn.query(query, { project });

  if (!response) {
    return new AppError(`Couldn't get data`, 404);
  }

  res.set(customHeader(3600)).status(200).json({
    status: 'success',
    data: response,
  });
};

module.exports = { getMedian, getMedianProject };
