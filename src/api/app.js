const express = require('express');
const helmet = require('helmet');
const { Redis } = require("ioredis");

const redis = new Redis(process.env.REDIS_URL, { maxRetriesPerRequest: 1, enableOfflineQueue: false });
redis.on('error', () => {});

const yieldRoutes = require('./routes/yield');
const holderRoutes = require('./routes/holders');
const config = require('./routes/config');
const median = require('./routes/median');
const perp = require('./routes/perp');
const enriched = require('./routes/enriched');
const lsd = require('./routes/lsd');
const pools = require('./routes/pools');
const { getCacheDates } = require('../utils/headers');
const volatility = require('./routes/volatility');
const tokenAddress = require('./routes/tokenAddress');

// nosemgrep: javascript.express.security.audit.express-check-csurf-middleware-usage
// CSRF protection is not applicable to this service: the API is stateless and does
// not use cookie-based authentication. Browsers do not automatically attach credentials
// (cookies/sessions) to cross-origin requests against this endpoint, so the CSRF
// threat model does not apply. If cookie-based auth is introduced in the future,
// integrate `csrf-csrf` (double-submit cookie) or `csrf-sync` (synchronizer token)
// instead of a custom header-presence check.
const app = express();
app.use(require('morgan')('dev'));
app.use(helmet());
app.use(express.json());

async function redisCache (req, res, next) {
  const lastCacheUpdate = await redis.get("lastUpdate#"+req.url).catch(() => null)
  const {headers, nextCacheDate} = getCacheDates()
  const cacheObject = lastCacheUpdate !== null && Number(lastCacheUpdate) > (nextCacheDate.getTime() - 3600e3)
    ? await redis.get("data#"+req.url).catch(() => null) : null
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
        redis.set("data#" + res._apicache.url, content.toString()).catch(() => {})
        redis.set("lastUpdate#" + res._apicache.url, Date.now()).catch(() => {})
        res.set(headers)
      }
      return res._apicache.end.apply(this, arguments)
    }
    next()
  }
}

app.use('/', [volatility, holderRoutes, tokenAddress]);

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
