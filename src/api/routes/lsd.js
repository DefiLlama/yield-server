const express = require('express');
const router = express.Router();
const lsd = require('../controllers/lsd');
const asyncHandler = require('../asyncHandler');

router.route('/lsdRates').get(asyncHandler(lsd.getLsd));

module.exports = router;
