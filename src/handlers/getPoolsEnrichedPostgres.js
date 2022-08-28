const { getEnriched } = require('../controllers/enrichedController');

module.exports.handler = async (event, context) => {
  context.callbackWaitsForEmptyEventLoop = false;
  return await getEnriched(event.queryStringParameters);
};
