const { conn } = require('../db');

// In-memory cache — data only changes hourly (materialized view refresh),
// 1-hour TTL avoids unnecessary DB queries while staying fresh.
const CACHE_TTL = 60 * 60 * 1000;
let cache = { data: null, ts: 0 };

const getVolatility = async (req, res) => {
  // Prevent CDN (CloudFront/Cloudflare) from caching responses.
  res.setHeader('Cache-Control', 'private, no-store');

  if (cache.data && Date.now() - cache.ts < CACHE_TTL) {
    return res.status(200).json(cache.data);
  }

  try {
    const query = `
      SELECT "configID", apy_avg_30d, apy_median_30d, apy_std_30d, cv_30d
      FROM volatility
      WHERE cv_30d IS NOT NULL
    `;
    const response = await conn.query(query);

    if (!response || response.length === 0) {
      return res.status(404).json({ error: "Couldn't get volatility data" });
    }

    const result = {};
    for (const p of response) {
      result[p.configID] = [
        p.apy_avg_30d,
        p.apy_median_30d,
        p.apy_std_30d,
        p.cv_30d,
      ];
    }

    cache = { data: result, ts: Date.now() };
    res.status(200).json(result);
  } catch (err) {
    console.error('Volatility query error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

module.exports = { getVolatility };
