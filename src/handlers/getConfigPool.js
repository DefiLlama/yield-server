const { getConfigPool } = require('../controllers/configController');

module.exports.handler = async (event, context) => {
  context.callbackWaitsForEmptyEventLoop = false;
  return await getConfigPool(event.pathParameters.configIDs);
};
