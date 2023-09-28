const express = require('express');
const router = express.Router();
const lsd = require('../controllers/lsd');

router.route('/lsdRates').get(lsd.getLsd);

module.exports = router;
