const { getPerp } = require('../controllers/perpController');

module.exports.handler = async (event, context) => {
  context.callbackWaitsForEmptyEventLoop = false;
  return await getPerp();
};
