const dbConnection = require('../utils/dbConnectionPostgres.js');
const urlModel = require('../models/url');
const AppError = require('../utils/appError');

// get expanding standard deviation data
module.exports.handler = async (event, context) => {
  context.callbackWaitsForEmptyEventLoop = false;
  const conn = await dbConnection.connect();
  const M = conn.model(urlModel.modelName);

  // return all documents
  const response = await M.find({}, { _id: 0 });

  if (!response) {
    return new AppError("Couldn't get url data", 404);
  }

  const out = {};
  for (const e of response) {
    out[e.project] = e.url;
  }
  return out;
};
