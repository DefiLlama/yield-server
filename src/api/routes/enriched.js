const express = require('express');
const router = express.Router();
const enriched = require('../controllers/enriched');

router.route('/poolsEnriched').get(enriched.getPoolEnriched);

// PRO API routes
router.route('/poolsPro').get(enriched.getPoolsEnrichedPro);
router.route('/poolsOld').get((req, res, next) => {
  res.set('Link', '</poolsPro>; rel="successor-version"');
  res.set('X-Preferred-Route', '/poolsPro');
  res.set('X-Notice', 'Prefer /poolsPro; this alias remains available.');
  next();
}, enriched.getPoolsEnrichedPro); // alias; prefer /poolsPro
router.route('/poolsBorrow').get(enriched.getPoolsBorrow);

module.exports = router;
