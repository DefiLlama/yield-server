const { getPoolsOld } = require('../controllers/enrichedController');

module.exports.handler = async (event) => {
  context.callbackWaitsForEmptyEventLoop = false;
  return await getPoolsOld();
};
