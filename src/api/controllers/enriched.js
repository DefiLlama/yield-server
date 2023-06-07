const validator = require('validator');

const AppError = require('../../utils/appError');
const { customHeader } = require('../../utils/lambda');

const AWS = require('aws-sdk');
AWS.config.update({
  accessKeyId: process.env.aws_access_key_id,
  secretAccessKey: process.env.aws_secret_access_key,
  region: process.env.region,
});

const { buildPoolsEnriched } = require('../../handlers/getPoolsEnriched');

const getPoolEnriched = async (req, res) => {
  // querystring (though we only use it for pool values on /pool pages)
  // note: change to route param later -> /pools/:pool

  console.log(req.query);
  const configID = req.query.pool;
  if (!configID || !validator.isUUID(configID))
    return res.status(400).json('invalid configID!');

  const response = await buildPoolsEnriched(req.query);

  if (!response) {
    return new AppError("Couldn't retrieve data", 404);
  }

  res.set(customHeader(3600)).status(200).json({
    status: 'success',
    data: response,
  });
};

module.exports = { getPoolEnriched };
