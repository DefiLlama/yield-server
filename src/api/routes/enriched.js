const express = require('express');
const router = express.Router();
const enriched = require('../controllers/enriched');

router.route('/poolsEnriched').get(enriched.getPoolEnriched);

module.exports = router;
