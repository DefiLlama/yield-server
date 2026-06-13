const { Redis } = require('ioredis');

const { pgp } = require('./db');
const { sendMessage } = require('../utils/discordWebhook');

const INTERVAL_MS = 60 * 1000;
const TIMEOUT_MS = 5 * 1000;
const DISCORD_WEBHOOK = process.env.STALE_PROJECTS_WEBHOOK;

const sql = pgp({
  connectionString: process.env.DATABASE_URL,
  max: 1,
  idleTimeoutMillis: 3000,
  connectionTimeoutMillis: TIMEOUT_MS,
  query_timeout: TIMEOUT_MS,
  statement_timeout: TIMEOUT_MS,
});

let redis;
let started = false;
let running = false;

const getRedis = () => {
  if (!redis) {
    redis = new Redis(process.env.REDIS_URL, {
      connectTimeout: TIMEOUT_MS,
      commandTimeout: TIMEOUT_MS,
      maxRetriesPerRequest: 1,
    });
    redis.on('error', () => {});
  }
  return redis;
};

const notify = (label, err) => {
  const message = `[yield-server api health] ${label} unhealthy: ${
    err?.message || String(err)
  }`;
  console.warn(message);

  if (!DISCORD_WEBHOOK) return;

  sendMessage(message, DISCORD_WEBHOOK).catch((discordErr) => {
    console.error('health ping discord notify error:', discordErr);
  });
};

const checkSql = () => sql.one('SELECT 1 AS ok');

const checkRedis = async () => {
  const response = await getRedis().ping();
  if (response !== 'PONG') {
    throw new Error(`unexpected redis response: ${response}`);
  }
};

const runHealthPing = async () => {
  if (running) return;
  running = true;

  try {
    try {
      await checkSql();
    } catch (err) {
      notify('sql', err);
    }

    try {
      await checkRedis();
    } catch (err) {
      notify('redis', err);
    }
  } catch (err) {
    console.error('health ping error:', err);
  } finally {
    running = false;
  }
};

const startHealthPing = () => {
  if (started) return;
  started = true;

  const interval = setInterval(runHealthPing, INTERVAL_MS);
  if (interval.unref) interval.unref();
  runHealthPing();
};

module.exports = { startHealthPing };
