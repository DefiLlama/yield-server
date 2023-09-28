const express = require('express');
const router = express.Router();
const enriched = require('../controllers/enriched');

router.route('/poolsEnriched').get(enriched.getPoolEnriched);
router.route('/poolsOld').get(enriched.getPoolsEnrichedOld);
router.route('/poolsBorrow').get(enriched.getPoolsBorrow);

module.exports = router;
