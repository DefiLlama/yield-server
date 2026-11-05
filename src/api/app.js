const express = require('express');
const helmet = require('helmet');
const { Redis } = require("ioredis");

const redis = new Redis(process.env.REDIS_URL, { maxRetriesPerRequest: 1, enableOfflineQueue: false });
redis.on('error', () => {});

const yieldRoutes = require('./routes/yield');
const config = require('./routes/config');
const median = require('./routes/median');
const perp = require('./routes/perp');
const enriched = require('./routes/enriched');
const lsd = require('./routes/lsd');
const pools = require('./routes/pools');
const { getCacheDates } = require('../utils/headers');
const tokenAddress = require('./routes/tokenAddress');

const app = express();
app.use(require('morgan')('dev'));
app.use(helmet());
app.use(express.json());

async function redisCache (req, res, next) {
  const {headers, nextCacheDate} = getCacheDates()
  const cacheObject = await redis.get("data#"+req.url).catch(() => null)
  if(cacheObject !== null){
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
        // HEAD responses have no body to cache
        if(content){
          // expire at the next :22 rollover, same as the Expires header
          const ttl = Math.max(1, Math.ceil((nextCacheDate.getTime() - Date.now()) / 1000))
          redis.set("data#" + res._apicache.url, content.toString(), "EX", ttl).catch(() => {})
        }
        res.set(headers)
      }
      return res._apicache.end.apply(this, arguments)
    }
    next()
  }
}

app.use('/', [tokenAddress]);

app.use(redisCache)

app.use('/', [yieldRoutes, config, median, perp, enriched, lsd, pools]);

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
