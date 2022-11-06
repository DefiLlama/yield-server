const { getMedian } = require('../controllers/medianController');

module.exports.handler = async (event, context) => {
  context.callbackWaitsForEmptyEventLoop = false;
  return await getMedian();
};
