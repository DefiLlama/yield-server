const AppError = require('../../utils/appError');
const { conn } = require('../db');

const getMedian = async (req, res) => {
  const query = `
    SELECT
        timestamp,
        "uniquePools",
        "medianAPY"
    FROM
        median
    ORDER BY
        timestamp ASC
    `;

  const response = await conn.query(query);

  if (!response) {
    return new AppError(`Couldn't get data`, 404);
  }

  res.status(200).json(response);
};

const getMedianProject = async (req, res) => {
  const project = req.params.project;
  const query = `
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
    `;
  const response = await conn.query(query, { project });

  if (!response) {
    return new AppError(`Couldn't get data`, 404);
  }

  res.status(200).json({
    status: 'success',
    data: response,
  });
};

module.exports = { getMedian, getMedianProject };
