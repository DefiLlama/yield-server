const AppError = require('../utils/appError');

const asyncHandler = (handler) => (req, res, next) =>
  Promise.resolve(handler(req, res, next))
    .then((result) => (result instanceof AppError ? next(result) : result))
    .catch(next);

module.exports = asyncHandler;
