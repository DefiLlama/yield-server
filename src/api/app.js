const express = require('express');
const helmet = require('helmet');
const { Redis } = require("ioredis");

const redis = new Redis(process.env.REDIS_URL);

const yield = require('./routes/yield');
const config = require('./routes/config');
const median = require('./routes/median');
const perp = require('./routes/perp');
const enriched = require('./routes/enriched');
const lsd = require('./routes/lsd');
const { customHeader } = require('../utils/headers');

const app = express();
app.use(require('morgan')('dev'));
app.use(helmet());

async function redisCache (req, res, next) {
  const lastCacheUpdate = await redis.get("lastUpdate#"+req.url) ?? 0
  if(Number(lastCacheUpdate) < (Date.now() - 3600e3)){
    const cacheObject = await redis.get("data#"+req.url)
    res.set(customHeader(24 * 3600))
    .status(200)
    .send(cacheObject);
  } else {
    res._apicache = {
        url: req.url,
        end: res.end
    }
    res.end = function(content, encoding) {
        redis.set("data#" + res._apicache.url, content.toString())
        redis.set("lastUpdate#" + res._apicache.url, Date.now())
        return res._apicache.end.apply(this, arguments)
    }
    next()
  }
}
app.use(redisCache)

app.use('/', [yield, config, median, perp, enriched, lsd]);

module.exports = app;
