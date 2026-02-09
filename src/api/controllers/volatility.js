const { conn } = require('../db');

const INTERNAL_KEY = process.env.YIELDS_INTERNAL_API_KEY;

const getVolatility = async (req, res) => {
  const apiKey = req.headers['x-internal-key'];
  if (!INTERNAL_KEY || !apiKey || apiKey !== INTERNAL_KEY) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const query = `
    SELECT "configID", apy_avg_30d, apy_median_30d, apy_std_30d, cv_30d
    FROM volatility
  `;
  const response = await conn.query(query);

  if (!response) {
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
  res.status(200).json(result);
};

module.exports = { getVolatility };
