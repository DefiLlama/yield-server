const express = require('express');
const router = express.Router();
const enriched = require('../controllers/enriched');

router.route('/pools').get(enriched.getPoolsEnriched);
router.route('/pools/:configID').get(enriched.getPoolEnriched);

module.exports = router;
