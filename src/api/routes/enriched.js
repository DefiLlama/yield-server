const express = require('express');
const router = express.Router();
const enriched = require('../controllers/enriched');
const sunsetNotice = require('../sunsetNotice');

router
  .route('/poolsEnriched')
  .get(sunsetNotice('/yields/v1/pools'), enriched.getPoolEnriched);

// PRO API routes
router
  .route('/poolsOld')
  .get(sunsetNotice('/yields/v1/pools'), enriched.getPoolsEnrichedPro);
router
  .route('/poolsBorrow')
  .get(sunsetNotice('/yields/v1/poolsBorrow'), enriched.getPoolsBorrow);

module.exports = router;
