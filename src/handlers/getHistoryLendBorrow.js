const { getYieldLendBorrowHistory } = require('../controllers/yieldController');
const validator = require('validator');

module.exports.handler = async (event, context) => {
  context.callbackWaitsForEmptyEventLoop = false;
  const configID = event.pathParameters.configID;
  if (!validator.isUUID(configID)) return { status: 'unvalid parameter' };
  return await getYieldLendBorrowHistory(configID);
};
