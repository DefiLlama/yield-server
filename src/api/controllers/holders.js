const validator = require('validator');

const { conn } = require('../db');
const {
  getLatestHolders,
  getHolderHistory: queryHolderHistory,
  getHolderOffset,
} = require('../../queries/holder');

const getHolderHistory = async (req, res) => {
  const configID = req.params.pool;
  if (!validator.isUUID(configID))
    return res.status(400).json('invalid configID!');

  try {
    const response = await queryHolderHistory(configID, conn);
    res.status(200).json({ status: 'success', data: response });
  } catch (err) {
    console.log('getHolderHistory failed:', err.message);
    res.status(500).json({ status: 'error' });
  }
};

const getHolders = async (req, res) => {
  try {
    const [latest, holderOffset7d, holderOffset30d] = await Promise.all([
      getLatestHolders(conn),
      getHolderOffset(7, conn),
      getHolderOffset(30, conn),
    ]);

    const data = {};
    for (const [configID, h] of Object.entries(latest)) {
      const prev7d = holderOffset7d[configID];
      const prev30d = holderOffset30d[configID];
      data[configID] = {
        holderCount: h.holderCount,
        avgPositionUsd:
          h.avgPositionUsd != null ? +(+h.avgPositionUsd).toFixed(0) : null,
        top10Pct: h.top10Pct != null ? +(+h.top10Pct).toFixed(2) : null,
        top10Holders: h.top10Holders ?? null,
        holderChange7d:
          h.holderCount != null && prev7d != null
            ? h.holderCount - prev7d
            : null,
        holderChange30d:
          h.holderCount != null && prev30d != null
            ? h.holderCount - prev30d
            : null,
      };
    }

    res.status(200).json({ status: 'success', data });
  } catch (err) {
    console.log('getHolders failed:', err.message);
    res.status(500).json({ status: 'error' });
  }
};

module.exports = {
  getHolderHistory,
  getHolders,
};
