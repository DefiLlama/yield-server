const validator = require('validator');

const customHeader = require('../../utils/customHeader');
const { buildPoolsEnriched } = require('../../handlers/queries');

const getPoolEnriched = async (req, res) => {
  const configID = req.params.configID;
  if (!validator.isUUID(configID))
    return res.status(400).json('invalid configID!');

  const response = await buildPoolsEnriched(configID);

  if (!response) {
    return new AppError("Couldn't retrieve data", 404);
  }

  res.set(customHeader()).status(200).json({
    status: 'success',
    data: response,
  });
};

const getPoolsEnriched = async (req, res) => {
  const response = await buildPoolsEnriched(undefined);

  if (!response) {
    return new AppError("Couldn't retrieve data", 404);
  }

  res.set(customHeader()).status(200).json({
    status: 'success',
    data: response,
  });
};

module.exports = { getPoolEnriched, getPoolsEnriched };
