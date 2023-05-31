const validator = require('validator');

const AppError = require('../../utils/appError');
const { conn } = require('../db');
const { customHeader } = require('../../utils/lambda');
const { yieldHistoryQuery } = require('../../controllers/yieldController');

const getYieldHistory = async (req, res) => {
  const configID = req.params.pool;
  if (!validator.isUUID(configID))
    return res.status(400).json('invalid configID!');

  const response = await conn.query(yieldHistoryQuery, {
    configIDValue: configID,
    table: 'yield',
  });

  if (!response) {
    return new AppError(`Couldn't get data`, 404);
  }

  res
    .set(customHeader(24 * 3600))
    .status(200)
    .json({
      status: 'success',
      data: response,
    });
};

module.exports = {
  getYieldHistory,
};
