const { getConfigPool } = require('../controllers/configController');
const validator = require('validator');

module.exports.handler = async (event, context) => {
  context.callbackWaitsForEmptyEventLoop = false;
  const configID = event.pathParameters.configID;
  const ids = configID.split(',');
  const valid =
    ids.map((id) => validator.isUUID(id)).reduce((a, b) => a + b, 0) ===
    ids.length;

  if (!valid) return { status: 'invalid uuid parameter' };
  return await getConfigPool(configID);
};
