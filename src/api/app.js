const express = require('express');
const helmet = require('helmet');

const yield = require('./routes/yield');

const app = express();
if (process.env.NODE_ENV === 'development') {
  app.use(require('morgan')('dev'));
}
app.use(helmet());

app.use('/', [yield]);

module.exports = app;
