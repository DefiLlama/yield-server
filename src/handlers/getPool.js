const { getPool } = require('../controllers/enrichedController');

module.exports.handler = async (event, context) => {
  context.callbackWaitsForEmptyEventLoop = false;
  return await getPool(event.pathParameters.configID);
};
