const { getYieldHistoryExt } = require('../controllers/yieldController');

module.exports.handler = async (event, context) => {
  context.callbackWaitsForEmptyEventLoop = false;
  return await getYieldHistoryExt(event.pathParameters.configID);
};
