const express = require('express');
const router = express.Router();
const lsd = require('../controllers/lsd');
const sunsetNotice = require('../sunsetNotice');

router.route('/lsdRates').get(sunsetNotice('/api/lstRates'), lsd.getLsd);

module.exports = router;
