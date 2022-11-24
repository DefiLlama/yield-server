const { getYieldLendBorrowHistory } = require('../controllers/yieldController');

module.exports.handler = async (event, context) => {
  context.callbackWaitsForEmptyEventLoop = false;
  return await getYieldLendBorrowHistory(event.pathParameters.configID);
};
