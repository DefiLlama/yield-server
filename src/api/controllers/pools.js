const axios = require('axios');

const AppError = require('../../utils/appError');

const S3_BASE = 'https://defillama-datasets.s3.eu-central-1.amazonaws.com';

const getPools = async (req, res) => {
  const response = await axios.get(`${S3_BASE}/yield-api/pools`);

  if (!response.data) {
    return new AppError("Couldn't retrieve data", 404);
  }

  res.status(200).json(response.data);
};

const getLendBorrow = async (req, res) => {
  const response = await axios.get(`${S3_BASE}/yield-api/lendBorrow`);

  if (!response.data) {
    return new AppError("Couldn't retrieve data", 404);
  }

  res.status(200).json(response.data);
};

module.exports = { getPools, getLendBorrow };
