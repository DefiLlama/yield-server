const express = require('express');
const router = express.Router();
const tokenAddress = require('../controllers/tokenAddress');
const asyncHandler = require('../asyncHandler');

router.route('/tokenAddress').get(asyncHandler(tokenAddress.getTokenAddress));

module.exports = router;
