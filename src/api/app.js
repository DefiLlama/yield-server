const express = require('express');
const helmet = require('helmet');

const config = require('./routes/config');
const median = require('./routes/median');
const medianProject = require('./routes/medianProject');
const perp = require('./routes/perp');
const yield = require('./routes/yield');

const app = express();
if (process.env.NODE_ENV === 'development') {
  app.use(require('morgan')('dev'));
}
app.use(helmet());

app.use('/', [config, median, medianProject, perp, yield]);

module.exports = app;
