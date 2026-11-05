const express = require('express');
const router = express.Router();
const perp = require('../controllers/perp');
const sunsetNotice = require('../sunsetNotice');

router.route('/perps').get(sunsetNotice('/api/perpFundingRates'), perp.getPerp);

module.exports = router;
