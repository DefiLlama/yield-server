const { getUrl } = require('../controllers/configController');

module.exports.handler = async (event, context) => {
  context.callbackWaitsForEmptyEventLoop = false;
  return await getUrl();
};
