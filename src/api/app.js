const express = require('express');
const helmet = require('helmet');

const yield = require('./routes/yield');
const config = require('./routes/config');
const median = require('./routes/median');
const perp = require('./routes/perp');
const enriched = require('./routes/enriched');

const app = express();
app.use(require('morgan')('dev'));
app.use(helmet());

app.use('/', [yield, config, median, perp, enriched]);

module.exports = app;
