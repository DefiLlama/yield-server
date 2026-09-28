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

const CACHE_TTL_SECONDS = 2 * 60 * 60;
const FILTERED_POOL_ROUTES = new Set(['/poolspro', '/poolsold']);

const getCachePath = (path) => {
  const trimmedPath = path.length > 1 ? path.replace(/\/+$/, '') : path;
  const routeEnd = trimmedPath.indexOf('/', 1);
  if (routeEnd === -1) return trimmedPath.toLowerCase();

  // express route names are case insensitive but path parameters are not, & only normalize the route portion of the path
  return (
    trimmedPath.slice(0, routeEnd).toLowerCase() + trimmedPath.slice(routeEnd)
  );
};

const withQueryParam = (path, key, value) =>
  `${path}?${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`;

const getCacheUrl = (req) => {
  const path = getCachePath(req.path);

  if (path === '/poolsenriched' && typeof req.query.pool === 'string') {
    return withQueryParam(path, 'pool', req.query.pool);
  }

  if (FILTERED_POOL_ROUTES.has(path)) {
    //  these routes only use the first query field as their filter, extra fields should not create more copies in redis
    const [key] = Object.keys(req.query);
    if (key !== undefined)
      return withQueryParam(path, key, JSON.stringify(req.query[key]));
  }

  return path;
};

async function redisCache (req, res, next) {
  if (req.method !== 'GET') return next();

  const cacheUrl = getCacheUrl(req);
  const lastCacheUpdate = await redis.get("lastUpdate#"+cacheUrl).catch(() => null)
  const {headers, nextCacheDate} = getCacheDates()
  const cacheObject = lastCacheUpdate !== null && Number(lastCacheUpdate) > (nextCacheDate.getTime() - 3600e3)
    ? await redis.get("data#"+cacheUrl).catch(() => null) : null
  if(cacheObject !== null){
    res.set(headers)
      .status(200)
      .send(cacheObject);
  } else {
    res._apicache = {
        url: cacheUrl,
        end: res.end
    }
    res.end = function(content, encoding) {
      if(res.statusCode === 200){
        // stale entries are ignored after the hourly refresh, the ttl lets redis reclaim them instead of keeping them around
        redis.set("data#" + res._apicache.url, content.toString(), 'EX', CACHE_TTL_SECONDS).catch(() => {})
        redis.set("lastUpdate#" + res._apicache.url, Date.now(), 'EX', CACHE_TTL_SECONDS).catch(() => {})
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
