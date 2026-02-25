const express = require('express');
const router = express.Router();
const enriched = require('../controllers/enriched');

// main pool response
router.route('/pools').get(enriched.getPools);

// borrow yields
router.route('/lendBorrow').get(enriched.getLendBorrow);

// used for chart pages
router.route('/poolsEnriched').get(enriched.getPoolEnriched);

// PRO API routes
router.route('/poolsPro').get(enriched.getPoolsEnrichedPro);
router.route('/poolsOld').get((req, res, next) => {
  res.set('Link', '</poolsPro>; rel="successor-version"');
  res.set('X-Preferred-Route', '/poolsPro');
  res.set('X-Notice', 'Prefer /poolsPro; this alias remains available.');
  next();
}, enriched.getPoolsEnrichedPro); // alias; prefer /poolsPro
// combines both supply and borrow data
router.route('/poolsBorrow').get(enriched.getPoolsBorrow);

module.exports = router;
