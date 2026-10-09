const express = require('express');
const router = express.Router();
const perp = require('../controllers/perp');
const asyncHandler = require('../asyncHandler');

router.route('/perps').get(asyncHandler(perp.getPerp));

module.exports = router;
