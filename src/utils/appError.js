class AppError extends Error {
  constructor(message, statusCode) {
    super(message);
    this.statusCode = statusCode;
    this.status = `${statusCode}`.startsWith('4') ? 'fail' : 'error';
    // prevent onstructor function to be in the stacktrace of an error
    Error.captureStackTrace(this, this.constructor);
  }
}

module.exports = AppError;
