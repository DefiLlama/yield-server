const express = require('express');
const router = express.Router();
const enriched = require('../controllers/enriched');
const asyncHandler = require('../asyncHandler');

router.route('/poolsEnriched').get(asyncHandler(enriched.getPoolEnriched));

// PRO API routes
router.route('/poolsPro').get(asyncHandler(enriched.getPoolsEnrichedPro));
router.route('/poolsOld').get((req, res, next) => {
  res.set('Link', '</poolsPro>; rel="successor-version"');
  res.set('X-Preferred-Route', '/poolsPro');
  res.set('X-Notice', 'Prefer /poolsPro; this alias remains available.');
  next();
}, asyncHandler(enriched.getPoolsEnrichedPro)); // alias; prefer /poolsPro
router.route('/poolsBorrow').get(asyncHandler(enriched.getPoolsBorrow));

module.exports = router;
