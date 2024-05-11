const express = require('express');
const helmet = require('helmet');
const { Redis } = require("ioredis");

const redis = new Redis(process.env.REDIS_URL);

const yieldRoutes = require('./routes/yield');
const config = require('./routes/config');
const median = require('./routes/median');
const perp = require('./routes/perp');
const enriched = require('./routes/enriched');
const lsd = require('./routes/lsd');
const { getCacheDates } = require('../utils/headers');

const app = express();
app.use(require('morgan')('dev'));
app.use(helmet());

async function redisCache (req, res, next) {
  const lastCacheUpdate = await redis.get("lastUpdate#"+req.url)
  const {headers, nextCacheDate} = getCacheDates()
  if(lastCacheUpdate !== null && Number(lastCacheUpdate) > (nextCacheDate.getTime() - 3600e3)){
    const cacheObject = await redis.get("data#"+req.url)
    res.set(headers)
      .status(200)
      .send(cacheObject);
  } else {
    res._apicache = {
        url: req.url,
        end: res.end
    }
    res.end = function(content, encoding) {
      if(res.statusCode === 200){
        redis.set("data#" + res._apicache.url, content.toString())
        redis.set("lastUpdate#" + res._apicache.url, Date.now())
        res.set(headers)
      }
      return res._apicache.end.apply(this, arguments)
    }
    next()
  }
}
app.use(redisCache)

app.use('/', [yieldRoutes, config, median, perp, enriched, lsd]);

function errorHandler (err, req, res, next) {
  console.log(err)
  res.status(500)
  res.render('error', { error: err })
}

app.use(errorHandler)

process.on('uncaughtException', (err) => {
  console.error('uncaughtException:', err.message);
  process.exit(1);
});

module.exports = app;
