const { conn } = require('../db');
const { customHeader } = require('../../utils/headers');

const CACHE_TTL = 60 * 60 * 1000;
let cache = { data: null, ts: 0 };

const getTokenAddress = async (req, res) => {
  if (cache.data && Date.now() - cache.ts < CACHE_TTL) {
    return res.set(customHeader(3600)).status(200).json(cache.data);
  }

  try {
    const query = `
      SELECT config_id AS "configID", token
      FROM config
      WHERE token IS NOT NULL
    `;
    const response = await conn.query(query);

    if (!response || response.length === 0) {
      return res.status(404).json({ error: "Couldn't get token address data" });
    }

    const result = {};
    for (const p of response) {
      result[p.configID] = p.token;
    }

    cache = { data: result, ts: Date.now() };
    res.set(customHeader(3600)).status(200).json(result);
  } catch (err) {
    console.error('Token addresses query error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

module.exports = { getTokenAddress };
