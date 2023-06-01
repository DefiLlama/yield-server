const express = require('express');
const helmet = require('helmet');

const yield = require('./routes/yield');

const app = express();
app.use(require('morgan')('dev'));
app.use(helmet());

app.use('/', [yield]);

module.exports = app;
