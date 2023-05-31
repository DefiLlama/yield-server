const validator = require('validator');

const customHeader = require('../../utils/customHeader');
const { buildPoolsEnriched } = require('../../handlers/queries');

const getPoolEnriched = async (req, res) => {
  // need to see how to use query string here
  const configID = req.query.configID;
  const response = await buildPoolsEnriched(configID);

  if (!response) {
    return new AppError("Couldn't retrieve data", 404);
  }

  res.set(customHeader()).status(200).json({
    status: 'success',
    data: response,
  });
};
