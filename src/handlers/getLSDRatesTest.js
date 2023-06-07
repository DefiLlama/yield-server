const { getLsd } = require('../controllers/lsdController');

module.exports.handler = async (event, context) => {
  context.callbackWaitsForEmptyEventLoop = false;
  return await getLsd();
};
