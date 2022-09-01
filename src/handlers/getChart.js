const { getYieldHistory } = require('../controllers/yieldController');

module.exports.handler = async (event, context) => {
  context.callbackWaitsForEmptyEventLoop = false;
  return await getYieldHistory(event.pathParameters.configID);
};
